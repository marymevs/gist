/**
 * HTML-to-PDF conversion using headless Chromium.
 *
 * Uses @sparticuz/chromium (serverless-optimized Chromium binary) with
 * puppeteer-core. Launches a fresh browser per call, renders the HTML,
 * and returns the PDF as a Buffer.
 *
 * The fax template's @page CSS rules control page size and margins —
 * we tell Puppeteer to respect them via preferCSSPageSize.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/**
 * Convert an HTML string to a US Letter PDF buffer.
 *
 * The HTML is expected to include its own @page rules for sizing/margins
 * (as the fax template does). Puppeteer respects those via preferCSSPageSize.
 */
export async function convertHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
