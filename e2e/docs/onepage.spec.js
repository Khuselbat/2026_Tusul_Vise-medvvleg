/* global document -- page.evaluate() дотор браузерт ажиллана */
// Зочны нэг хуудасны дэлгэцийн зураг: 6 өргөн (2560, 1920, 1536, 1366, 768, 390) × гэрэлтэй/харанхуй
//   → docs/screenshots/onepage/w<өргөн>-<горим>-<хэсэг>.png
//   cd client && npm run build && cd ..
//   npx playwright test --config playwright.docs.config.js e2e/docs/onepage.spec.js
import path from 'node:path';
import { test, expect } from '@playwright/test';

const OUT = path.join(process.cwd(), 'docs', 'screenshots', 'onepage');
const WIDTHS = [
  [2560, 1440],
  [1920, 1080],
  [1536, 864],
  [1366, 768],
  [768, 1024],
  [390, 844],
];

for (const [width, height] of WIDTHS) {
  for (const scheme of ['light', 'dark']) {
    test(`${width}px · ${scheme}`, async ({ browser, baseURL }) => {
      const mobile = width < 500;
      // Системийн горим (prefers-color-scheme) — theme.js хэрэглэгч сонгоогүй үед түүнийг дагана.
      // reducedMotion: гарч ирэх анимацгүй тул хэсгүүд эцсийн байрлалдаа зурагдана.
      const ctx = await browser.newContext({
        baseURL,
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
        locale: 'mn-MN',
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      const shot = (name) => page.screenshot({ path: path.join(OUT, `w${width}-${scheme}-${name}.png`), animations: 'disabled' });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // Хэвтээ гүйлтгүй
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await shot('1-hero');
      for (const [i, id] of [
        [2, 'check'],
        [3, 'visas'],
        [4, 'faq'],
      ]) {
        await page.goto(`/#${id}`);
        await page.waitForLoadState('networkidle');
        await shot(`${i}-${id}`);
      }
      if (mobile) {
        await page.getByRole('button', { name: 'Цэс' }).click();
        await shot('5-menu');
      }
      await ctx.close();
    });
  }
}
