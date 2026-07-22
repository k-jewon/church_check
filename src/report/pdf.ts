import puppeteer from 'puppeteer-core';
import { resolveChromePath } from '../config.js';

const PX_PER_MM = 96 / 25.4;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_MM = 210;
const MARGIN_MM = 8;
const PRINTABLE_H_PX = (A4_HEIGHT_MM - 2 * MARGIN_MM) * PX_PER_MM;
const PRINTABLE_W_PX = Math.round((A4_WIDTH_MM - 2 * MARGIN_MM) * PX_PER_MM);

const BASE_FONT_PX = 11;
const MIN_FONT_PX = (7 * 96) / 72; // 7pt readability floor ≈ 9.33px

// Render report HTML to an A4 PDF. Shrinks to a single page down to the 7pt
// floor; if it still overflows, lets it flow to multiple pages with a footer.
export async function renderPdf(html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: PRINTABLE_W_PX, height: Math.round(PRINTABLE_H_PX) });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const setFont = (px: number) =>
      page.evaluate((p) => {
        document.documentElement.style.setProperty('--fs', `${p}px`);
        return document.body.scrollHeight;
      }, px);

    const baseHeight = await setFont(BASE_FONT_PX);
    let fontPx = BASE_FONT_PX;
    if (baseHeight > PRINTABLE_H_PX) {
      fontPx = Math.max(MIN_FONT_PX, BASE_FONT_PX * (PRINTABLE_H_PX / baseHeight));
    }
    const finalHeight = await setFont(fontPx);
    const multipage = finalHeight > PRINTABLE_H_PX + 2;

    return await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
      displayHeaderFooter: multipage,
      headerTemplate: '<div></div>',
      footerTemplate: multipage
        ? '<div style="font-size:8px;width:100%;text-align:center;color:#666;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
        : '<div></div>',
    });
  } finally {
    await browser.close();
  }
}
