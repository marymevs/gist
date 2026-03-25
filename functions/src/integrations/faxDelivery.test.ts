/**
 * Tests for faxDelivery.ts — Phaxio HTML-to-fax integration.
 *
 * All HTTP calls are mocked via vi.stubGlobal('fetch', ...).
 * Phaxio secrets are stubbed via process.env.
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

function phaxioSuccess(faxId = '12345'): Response {
  return new Response(
    JSON.stringify({ success: true, data: { id: faxId } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function phaxioError(status: number, body = 'Bad request'): Response {
  return new Response(body, { status });
}

function phaxioServerError(): Response {
  return new Response('Internal server error', { status: 500 });
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.PHAXIO_API_KEY = 'test-key';
  process.env.PHAXIO_API_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.PHAXIO_API_KEY;
  delete process.env.PHAXIO_API_SECRET;
  delete process.env.PHAXIO_TEST_MODE;
  vi.restoreAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('sendMorningGistFax', () => {
  it('returns success with fax ID on HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(phaxioSuccess('99')));

    const result = await sendMorningGistFax({
      faxNumber: '+12125551234',
      html: '<html>test</html>',
      userId: 'user-1',
    });

    expect(result).toEqual({ success: true, faxId: '99' });
  });

  it('returns failure immediately on 4xx (permanent error, no retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(phaxioError(400, 'Invalid number'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '+12125550000',
      html: '<html>test</html>',
      userId: 'user-2',
    });

    expect(result.success).toBe(false);
    // Should only attempt once — no retry on 4xx
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx and succeeds on second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(phaxioServerError())
      .mockResolvedValueOnce(phaxioSuccess('77'));
    vi.stubGlobal('fetch', fetchMock);

    // Skip the real 5s delay in tests
    vi.useFakeTimers();
    const promise = sendMorningGistFax({
      faxNumber: '+12125551234',
      html: '<html>test</html>',
      userId: 'user-3',
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual({ success: true, faxId: '77' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure after 2 failed 5xx attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(phaxioServerError());
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const promise = sendMorningGistFax({
      faxNumber: '+12125551234',
      html: '<html>test</html>',
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
      html: '<html>test</html>',
      userId: 'user-5',
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    // Network errors are not permanent — the loop retries once, then returns the
    // generic "failed after 2 attempts" message (not the individual network error).
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Phaxio fax failed after 2 attempts.');
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns failure immediately when no fax number is provided', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '   ',
      html: '<html>test</html>',
      userId: 'user-6',
    });

    expect(result).toEqual({ success: false, error: 'No fax number provided.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns failure when credentials are not configured', async () => {
    delete process.env.PHAXIO_API_KEY;
    delete process.env.PHAXIO_API_SECRET;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMorningGistFax({
      faxNumber: '+12125551234',
      html: '<html>test</html>',
      userId: 'user-7',
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
