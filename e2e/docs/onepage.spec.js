// Зочны нэг хуудасны дэлгэцийн зураг: desktop + mobile × гэрэлтэй + харанхуй → docs/screenshots/onepage/*.png
//   cd client && npm run build && cd ..
//   npx playwright test --config playwright.docs.config.js e2e/docs/onepage.spec.js
import path from 'node:path';
import { test, devices } from '@playwright/test';

const OUT = path.join(process.cwd(), 'docs', 'screenshots', 'onepage');
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { ...devices['Pixel 7'] },
};

for (const [device, opts] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    test(`${device} · ${scheme}`, async ({ browser, baseURL }) => {
      // Системийн горим (prefers-color-scheme) — theme.js хэрэглэгч сонгоогүй үед түүнийг дагана.
      // reducedMotion: гарч ирэх анимацгүй тул хэсгүүд эцсийн байрлалдаа зурагдана.
      const ctx = await browser.newContext({ ...opts, baseURL, locale: 'mn-MN', colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const shot = (name, o = {}) => page.screenshot({ path: path.join(OUT, `${device}-${scheme}-${name}.png`), animations: 'disabled', ...o });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await shot('1-hero');
      await page.goto('/#check');
      await page.waitForLoadState('networkidle');
      await shot('2-check');
      await page.goto('/#faq');
      await page.waitForLoadState('networkidle');
      await page.locator('#faq summary').first().click();
      await shot('3-faq');
      if (device === 'mobile') {
        await page.getByRole('button', { name: 'Цэс' }).click();
        await shot('4-menu');
      }
      await ctx.close();
    });
  }
}
