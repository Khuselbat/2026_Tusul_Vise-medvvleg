// docs/USER_GUIDE.md-д зориулсан дэлгэцийн зураг (npm run docs:screenshots). Бүх өгөгдөл зохиомол (seed).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';
import { uiLogin } from '../helpers.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'screenshots', 'guide');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
const DEMO = {
  admin: ['admin@civiz.mn', 'Admin1234'],
  operator: ['operator@civiz.mn', 'Operator1234'],
  applicant: ['applicant@civiz.mn', 'Applicant1234'],
};

/** Хуудас ачаалагдаж (skeleton алга болж) тогтворжсоны дараа зураг авна */
async function shot(page, name, { full = false } = {}) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.skeleton')).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full, animations: 'disabled' });
}

test('мэдүүлэгч', async ({ page }) => {
  await page.goto('/');
  await shot(page, 'a01_home');
  await page.goto('/visas');
  await shot(page, 'a02_visas');
  const { visas } = await (await page.request.get('/api/visas')).json();
  await page.goto(`/visas/${visas.find((v) => v.canApply).versionId}`);
  await shot(page, 'a03_visa_detail', { full: true });
  await page.goto('/register');
  await shot(page, 'a04_register');

  await uiLogin(page, ...DEMO.applicant);
  await shot(page, 'a05_dashboard');
  await page.goto('/app/new');
  await shot(page, 'a06_new_select');
  await page.getByRole('link', { name: 'Сонгох' }).first().click();
  await expect(page.locator('form')).toBeVisible();
  await shot(page, 'a06b_form', { full: true });
  await page.goto('/app/applications');
  await shot(page, 'a07_archive');
  const list = await (await page.request.get('/api/app/applications')).json();
  const items = list.items;
  const pick = (st) => items.find((x) => x.status === st) || items[0];
  await page.goto(`/app/applications/${pick('COMPLETE').publicId}`);
  await shot(page, 'a08_application_detail', { full: true });
  await page.goto('/app/official-result');
  await shot(page, 'a09_official_result');
  await page.goto('/app/imports');
  await shot(page, 'a10_imports');
  await page.goto('/app/profile');
  await shot(page, 'a11_profile', { full: true });
  // Бичиг баримтын сан (жишээ баримттай)
  await page.request.post('/api/app/profile/documents', {
    headers: { 'X-Requested-With': 'civiz' },
    multipart: { typeCode: 'PHOTO', file: { name: 'photo.png', mimeType: 'image/png', buffer: PNG } },
  });
  await page.goto('/app/documents');
  await shot(page, 'a13_documents', { full: true });
});

test('мэдүүлэгч — гар утас', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'mn-MN' });
  const page = await ctx.newPage();
  await uiLogin(page, ...DEMO.applicant);
  await shot(page, 'a12_mobile_dashboard');
  await ctx.close();
});

test('оператор', async ({ page }) => {
  await uiLogin(page, ...DEMO.operator, { staff: true });
  await shot(page, 'o01_worklist');
  const list = await (await page.request.get('/api/operator/applications')).json();
  const items = list.items;
  const target = items.find((x) => x.status === 'IN_REVIEW') || items[0];
  await page.goto(`/operator/applications/${target.publicId}`);
  await shot(page, 'o02_review', { full: true });
  await page.goto('/operator/history');
  await shot(page, 'o03_my_reviews');
});

test('админ', async ({ page }) => {
  await uiLogin(page, ...DEMO.admin, { staff: true });
  await shot(page, 'd01_dashboard');
  await page.goto('/admin/assignments');
  await shot(page, 'd02_assignments');
  await page.goto('/admin/visa-types');
  await shot(page, 'd03_visa_types');
  const { visaTypes } = await (await page.request.get('/api/admin/visa-types')).json();
  await page.goto(`/admin/visa-types/${visaTypes[0].id}/versions`);
  await shot(page, 'd04_versions');
  await page.goto('/admin/users');
  await shot(page, 'd05_users');
  await page.goto('/admin/stats');
  await shot(page, 'd06_stats', { full: true });
  await page.goto('/admin/audit');
  await shot(page, 'd07_audit');
});
