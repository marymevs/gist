/**
 * Tests for htmlToPdf.ts — Chromium-based HTML-to-PDF conversion.
 *
 * Puppeteer and @sparticuz/chromium are fully mocked.
 * No real browser is launched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock modules (factories are hoisted — no external variable refs) ─────────

vi.mock('@sparticuz/chromium', () => ({
  default: {
    args: ['--no-sandbox'],
    executablePath: vi.fn().mockResolvedValue('/fake/chromium'),
  },
}));

vi.mock('puppeteer-core', () => {
  const mockPdf = vi.fn().mockResolvedValue(Buffer.from('fake-pdf'));
  const mockSetContent = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);

  return {
    default: {
      launch: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          setContent: mockSetContent,
          pdf: mockPdf,
        }),
        close: mockClose,
      }),
      // Expose mocks for test assertions
      __mocks: { mockPdf, mockSetContent, mockClose },
    },
  };
});

import { convertHtmlToPdf } from './htmlToPdf';
import puppeteer from 'puppeteer-core';

// Access the mocks from the factory
const { mockPdf, mockSetContent, mockClose } = (puppeteer as any).__mocks;
const mockLaunch = puppeteer.launch as ReturnType<typeof vi.fn>;

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-wire the mocks after clearAllMocks resets them
  mockPdf.mockResolvedValue(Buffer.from('fake-pdf'));
  mockSetContent.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
  mockLaunch.mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({
      setContent: mockSetContent,
      pdf: mockPdf,
    }),
    close: mockClose,
  });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('convertHtmlToPdf', () => {
  it('returns a PDF buffer from valid HTML', async () => {
    const result = await convertHtmlToPdf('<html><body>Hello</body></html>');

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('fake-pdf');
  });

  it('launches Chromium with serverless args', async () => {
    await convertHtmlToPdf('<html></html>');

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--no-sandbox'],
        headless: true,
      }),
    );
  });

  it('sets HTML content with waitUntil networkidle0', async () => {
    const html = '<html><body>Test</body></html>';
    await convertHtmlToPdf(html);

    expect(mockSetContent).toHaveBeenCalledWith(html, { waitUntil: 'networkidle0' });
  });

  it('generates PDF with correct options', async () => {
    await convertHtmlToPdf('<html></html>');

    expect(mockPdf).toHaveBeenCalledWith({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
    });
  });

  it('closes the browser after success', async () => {
    await convertHtmlToPdf('<html></html>');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes the browser even when pdf() throws', async () => {
    mockPdf.mockRejectedValueOnce(new Error('PDF render failed'));

    await expect(convertHtmlToPdf('<html></html>')).rejects.toThrow('PDF render failed');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes the browser even when setContent() throws', async () => {
    mockSetContent.mockRejectedValueOnce(new Error('Content load failed'));

    await expect(convertHtmlToPdf('<html></html>')).rejects.toThrow('Content load failed');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
