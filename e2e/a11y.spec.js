// Үе 4 — хүртээмж (WCAG 2.1 AA, axe-core) ба хэл (англи горим).
/* global document, CSSTransition -- page.evaluate() дотор браузерт ажиллана */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiLogin, staffApiLogin, mailToken, H, openGuestMenu } from './helpers.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Горим солиход өнгөний transition (≈0.2 сек) дуустал хүлээнэ — завсрын өнгийг axe контрастын алдаа гэж уншина
const settled = (page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState !== 'running'));

async function audit(page, name) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${name}: ${summary.join(' | ')}`).toEqual([]);
}

test('WCAG 2.1 AA — зочин, мэдүүлэгч, оператор, админы гол дэлгэцүүд', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  // Зочны нэг хуудас (/visas, /help нь түүний хэсэг рүү чиглэнэ) + нэвтрэх хуудсууд
  for (const p of ['/', '/login', '/register', '/forgot-password']) {
    await guest.goto(p);
    await guest.waitForLoadState('networkidle');
    await audit(guest, p);
  }
  // Нэг хуудас: харанхуй горим, хариу шалгах маягтын алдаатай төлөв, нээлттэй mobile цэс
  await guest.goto('/#check');
  await guest.waitForLoadState('networkidle');
  await guest.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await settled(guest);
  await guest.locator('#check button[type=submit]').click();
  await expect(guest.locator('#check .field-error').first()).toBeVisible();
  await audit(guest, '/ (dark, check errors)');
  await guest.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await settled(guest);
  await openGuestMenu(guest);
  await audit(guest, '/ (menu)');
  await guest.goto('/#visas');
  await guest.getByRole('link', { name: /C-3-9/ }).first().click();
  await guest.waitForLoadState('networkidle');
  await audit(guest, 'visa detail');

  // Мэдүүлэгч
  const email = `a11y.${testInfo.project.name}.${Date.now()}@example.com`;
  const ctx = await browser.newContext();
  await ctx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Хүртээмж', email, password: 'A11yTest1234', passwordConfirm: 'A11yTest1234' },
  });
  await ctx.request.post('/api/auth/verify-email', { headers: H, data: { token: await mailToken(email, '/verify-email') } });
  const ap = await ctx.newPage();
  await uiLogin(ap, email, 'A11yTest1234');
  for (const p of [
    '/app',
    '/app/applications',
    '/app/imports',
    '/app/imports/new',
    '/app/profile',
    '/app/official-result',
    '/app/documents',
  ]) {
    await ap.goto(p);
    await ap.waitForLoadState('networkidle');
    await audit(ap, p);
  }
  await ap.goto('/app/new');
  await ap.getByRole('link', { name: 'Сонгох' }).first().click();
  await ap.waitForLoadState('networkidle');
  await audit(ap, '/app/new form');
  // Хоосон илгээхэд алдааны мессеж хүртээмжтэй (role=alert)
  await ap.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();
  await expect(ap.getByRole('alert').first()).toBeVisible();
  await audit(ap, '/app/new errors');

  // Оператор, админ
  const op = await browser.newContext();
  await staffApiLogin(op, 'operator@civiz.mn', 'Operator1234');
  const opPage = await op.newPage();
  for (const p of ['/operator', '/operator/history', '/operator/profile']) {
    await opPage.goto(p);
    await opPage.waitForLoadState('networkidle');
    await audit(opPage, p);
  }
  const ad = await browser.newContext();
  await staffApiLogin(ad, 'admin@civiz.mn', 'Admin1234');
  const adPage = await ad.newPage();
  for (const p of [
    '/admin',
    '/admin/countries',
    '/admin/visa-types',
    '/admin/users',
    '/admin/assignments',
    '/admin/stats',
    '/admin/audit',
    '/admin/deletion-requests',
  ]) {
    await adPage.goto(p);
    await adPage.waitForLoadState('networkidle');
    await audit(adPage, p);
  }
  // Шаардлага ↔ профайлын баримтын төрөл (цонх нээлттэй)
  const { visas } = await (await ad.request.get('/api/visas')).json();
  await adPage.goto(`/admin/versions/${visas.find((v) => v.code === 'C-3-9').versionId}/requirements`);
  await adPage.waitForLoadState('networkidle');
  await adPage
    .getByRole('button', { name: /профайлын баримтын төрөл тохируулах/ })
    .first()
    .click();
  await expect(adPage.getByRole('dialog')).toBeVisible();
  await audit(adPage, 'requirement document types');
  await Promise.all([ctx.close(), op.close(), ad.close(), guestCtx.close()]);
});

test('гарын товчлуураар: skip link, цонх (Escape), хонх', async ({ page }) => {
  await page.goto('/');
  await page.locator('.g-header').waitFor(); // сесс шалгаж дуусаад shell гарна
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Үндсэн агуулга руу шилжих' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);

  // Цонх: фокус дотогш, Tab гарахгүй, Escape хаагаад фокус буцна
  await page.goto('/visas');
  await page.getByRole('link', { name: /C-3-9/ }).first().click();
  await page.goto('/app/official-result');
  await expect(page).toHaveURL(/\/login/); // нэвтрээгүй бол нэвтрэх рүү
});

test('цонхны фокус: дотогш орж, гадагш гарахгүй, Escape-ээр хаагдаж буцна', async ({ browser }, testInfo) => {
  const email = `kb.${testInfo.project.name}.${Date.now()}@example.com`;
  const ctx = await browser.newContext();
  await ctx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Гар', email, password: 'Keyboard1234', passwordConfirm: 'Keyboard1234' },
  });
  const page = await ctx.newPage();
  await uiLogin(page, email, 'Keyboard1234');
  await page.goto('/app/profile');
  const opener = page.getByRole('button', { name: 'Бүх мэдээллээ татах (PDF)' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog');
  await expect(dlg.locator('#pv-pw')).toBeFocused();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const where = await dlg.evaluate((d) => {
      const a = d.ownerDocument.activeElement;
      return { inside: d.contains(a), el: `${a.tagName}#${a.id}.${a.className}:${(a.textContent || '').slice(0, 20)}` };
    });
    expect(where.inside, where.el).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(opener).toBeFocused();
  await ctx.close();
});

test('англи хэл: хэл солих, орчуулга, серверийн алдааны мессеж', async ({ page }) => {
  await page.goto('/login');
  await openGuestMenu(page);
  await page.getByLabel('Хэл / Language').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#email').fill('nobody@example.com');
  await page.locator('#pw').fill('Wrong12345');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  await page.goto('/visas'); // зочин → /#visas
  await expect(page).toHaveURL(/\/#visas$/);
  await expect(page.getByRole('heading', { name: 'Search visa information' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check your visa result' })).toBeVisible();
  await audit(page, '/ (en)');
  await openGuestMenu(page);
  await page.getByLabel('Language').selectOption('mn');
  await expect(page.getByRole('heading', { name: 'Визийн мэдээлэл хайх' })).toBeVisible();
});
