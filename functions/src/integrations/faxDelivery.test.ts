/**
 * Tests for faxDelivery.ts — iFax API integration.
 *
 * All HTTP calls are mocked via vi.stubGlobal('fetch', ...).
 * iFax API key is stubbed via process.env.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── stub secrets before the module is loaded ──────────────────────────────────
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () => {
      throw new Error(`Secret ${name} not available in test`);
    },
  }),
}));

// ── stub logger ───────────────────────────────────────────────────────────────
vi.mock('firebase-functions', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendMorningGistFax } from './faxDelivery';

// ── helpers ───────────────────────────────────────────────────────────────────

function ifaxSuccess(jobId = 'job-12345'): Response {
  return new Response(
    JSON.stringify({ status: 1, message: 'Fax queued', data: { jobId } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function ifaxError(status: number, body = 'Bad request'): Response {
  return new Response(body, { status });
}

function ifaxServerError(): Response {
  return new Response('Internal server error', { status: 500 });
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.IFAX_API_KEY = 'test-api-key';
});

afterEach(() => {
  delete process.env.IFAX_API_KEY;
  vi.restoreAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('sendMorningGistFax', () => {
  it('returns success with job ID on HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ifaxSuccess('job-99')));

    const result = await sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-1',
    });

    expect(result).toEqual({ success: true, jobId: 'job-99' });
  });

  it('sends correct request shape to iFax API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ifaxSuccess());
    vi.stubGlobal('fetch', fetchMock);

    await sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.ifaxapp.com/v1/customer/fax-send');
    expect(opts.method).toBe('POST');
    expect(opts.headers.accessToken).toBe('test-api-key');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body.faxNumber).toBe('+12125551234');
    expect(body.faxData).toHaveLength(1);
    expect(body.faxData[0].fileName).toBe('gist.pdf');
    expect(body.faxData[0].fileType).toBe('application/pdf');
    // fileData should be the base64 PDF passed through as-is
    expect(body.faxData[0].fileData).toBe(Buffer.from('fake-pdf-content').toString('base64'));
  });

  it('returns failure immediately on 4xx (permanent error, no retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ifaxError(400, 'Invalid number'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '+12125550000',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-2',
    });

    expect(result.success).toBe(false);
    // Should only attempt once — no retry on 4xx
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx and succeeds on second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ifaxServerError())
      .mockResolvedValueOnce(ifaxSuccess('job-77'));
    vi.stubGlobal('fetch', fetchMock);

    // Skip the real 5s delay in tests
    vi.useFakeTimers();
    const promise = sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-3',
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual({ success: true, jobId: 'job-77' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure after 2 failed 5xx attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ifaxServerError());
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const promise = sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-4',
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure after 2 network errors (retries once, then gives up)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const promise = sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-5',
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('iFax fax failed after 2 attempts.');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure immediately when no fax number is provided', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '   ',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-6',
    });

    expect(result).toEqual({ success: false, error: 'No fax number provided.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns failure when API key is not configured', async () => {
    delete process.env.IFAX_API_KEY;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '+12125551234',
      pdfBase64: Buffer.from('fake-pdf-content').toString('base64'),
      userId: 'user-7',
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
