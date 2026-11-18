// Үе 3 UI: мэдээллээ PDF-ээр татах, бүртгэл устгах хүсэлт → админ баталгаажуулах → нэвтрэх боломжгүй.
import { test, expect } from '@playwright/test';
import { uiLogin, mailToken, H } from './helpers.js';

test('мэдээлэл татах ба бүртгэл устгах', async ({ browser }, testInfo) => {
  const email = `s3.${testInfo.project.name}.${Date.now()}@example.com`;
  const pw = 'Stage3Test1234';
  const apCtx = await browser.newContext({ acceptDownloads: true });
  const adCtx = await browser.newContext();
  const ap = await apCtx.newPage();
  const ad = await adCtx.newPage();

  await apCtx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Устгах Тест', email, password: pw, passwordConfirm: pw },
  });
  await apCtx.request.post('/api/auth/verify-email', { headers: H, data: { token: await mailToken(email, '/verify-email') } });
  await uiLogin(ap, email, pw);
  await ap.goto('/app/profile');

  // ── PDF татах: нууц үг буруу бол алдаа, зөв бол файл ──
  await ap.getByRole('button', { name: 'Бүх мэдээллээ татах (PDF)' }).click();
  const dlg = ap.getByRole('dialog');
  await dlg.locator('#pv-pw').fill('wrong-password1');
  await dlg.getByRole('button', { name: 'Татах' }).click();
  await expect(dlg.getByText('Нууц үг буруу байна.')).toBeVisible();
  await dlg.locator('#pv-pw').fill(pw);
  const [download] = await Promise.all([ap.waitForEvent('download'), dlg.getByRole('button', { name: 'Татах' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^civiz-export-\d{8}\.pdf$/);

  // ── Устгах хүсэлт ──
  await ap.getByRole('button', { name: 'Бүртгэл устгах хүсэлт' }).click();
  await ap.getByRole('dialog').locator('#pv-pw').fill(pw);
  await ap.getByRole('dialog').locator('#pv-reason').fill('Туршилт');
  await ap.getByRole('dialog').getByRole('button', { name: 'Хүсэлт илгээх' }).click();
  await expect(ap.getByText('Хянагдаж байна')).toBeVisible();

  // ── Админ баталгаажуулна ──
  await uiLogin(ad, 'admin@civiz.mn', 'Admin1234', { staff: true });
  await ad.goto('/admin/deletion-requests');
  const row = ad.locator('tr', { hasText: email });
  await row.getByRole('button', { name: 'Баталгаажуулж устгах' }).click();
  await ad.getByRole('dialog').getByRole('button', { name: 'Устгах' }).click();
  await expect(ad.locator('tr', { hasText: email })).toHaveCount(0);

  // ── Мэдүүлэгчийн сесс хүчингүй, нэвтрэх боломжгүй ──
  await ap.reload();
  await expect(ap.getByRole('dialog', { name: 'Сесс дууссан' }).or(ap.getByRole('link', { name: 'Нэвтрэх' }).first())).toBeVisible();
  const r = await apCtx.request.post('/api/auth/login', { headers: H, data: { email, password: pw } });
  expect(r.status()).toBe(401);

  await Promise.all([apCtx.close(), adCtx.close()]);
});
