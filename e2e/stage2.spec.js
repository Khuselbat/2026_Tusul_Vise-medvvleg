// Үе 2 UI: ажилтны 2FA бүртгэл (админ дахин тохируулсны дараа), нөөц код, сесс, нууц үг сэргээх, имэйл сануулга.
import { test, expect } from '@playwright/test';
import { uiLogin, totp, mailToken } from './helpers.js';

test('2FA бүртгэл, нөөц код, бүх төхөөрөмжөөс гарах', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const opCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const op = await opCtx.newPage();
  const opEmail = 'operator2@civiz.mn';

  // Админ оператор 2-ын 2FA-г дахин тохируулна
  await uiLogin(admin, 'admin@civiz.mn', 'Admin1234', { staff: true });
  await admin.goto('/admin/users');
  const row = admin.locator('tr', { hasText: opEmail });
  const resetBtn = row.getByRole('button', { name: '2FA дахин тохируулах' });
  if (await resetBtn.count()) {
    await resetBtn.click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
    await expect(row.getByText('Тохируулаагүй')).toBeVisible();
  }

  // Оператор нэвтрэхэд QR-аар бүртгүүлнэ
  await op.goto('/login');
  await op.locator('#email').fill(opEmail);
  await op.locator('#pw').fill('Operator1234');
  await op.getByRole('button', { name: 'Нэвтрэх' }).click();
  await expect(op).toHaveURL(/\/login\/mfa\?mode=ENROLL/);
  await expect(op.getByRole('img', { name: '2FA QR код' })).toBeVisible();
  const secret = (await op.getByTestId('mfa-secret').innerText()).trim();
  await op.locator('#mfa-code').fill(await totp(`${opEmail}#enroll`, secret));
  await op.getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(op.getByRole('heading', { name: 'Нөөц кодоо хадгална уу' })).toBeVisible();
  await expect(op.locator('.recovery-codes li')).toHaveCount(10);
  await op.getByRole('button', { name: 'Хадгалсан, үргэлжлүүлэх' }).click();
  await expect(op).toHaveURL(/\/operator$/);
  await expect(op.getByRole('button', { name: /^Мэдэгдэл/ })).toBeVisible();

  // Профайл: 2FA идэвхтэй; бүх төхөөрөмжөөс гарах
  await op.goto('/operator/profile');
  await expect(op.getByText('Идэвхтэй (TOTP)')).toBeVisible();
  await expect(op.getByText('Энэ төхөөрөмж')).toBeVisible();
  await op.getByRole('button', { name: 'Бүх төхөөрөмжөөс гарах' }).click();
  await op.getByRole('dialog').getByRole('button', { name: 'Бүгдээс гарах' }).click();
  await expect(op).toHaveURL(/\/login/);
  const r = await opCtx.request.get('/api/operator/applications');
  expect(r.status()).toBe(401);

  await Promise.all([adminCtx.close(), opCtx.close()]);
});

test('баталгаажаагүй сануулга, нууц үг сэргээх', async ({ page }, testInfo) => {
  const email = `s2.${testInfo.project.name}.${Date.now()}@example.com`;
  await page.goto('/register');
  await page.locator('#name').fill('Сэргээх Тест');
  await page.locator('#email').fill(email);
  await page.locator('#pw').fill('First12345');
  await page.locator('#pw2').fill('First12345');
  await page.getByRole('button', { name: 'Бүртгүүлэх' }).click();
  await uiLogin(page, email, 'First12345');
  await expect(page.getByText('баталгаажуулаагүй байна')).toBeVisible();
  await page.getByRole('button', { name: 'Гарах' }).click();

  // Нууц үгээ мартсан → имэйлийн холбоос → шинэ нууц үг
  await page.goto('/login');
  await page.getByRole('link', { name: 'Нууц үгээ мартсан уу?' }).click();
  await page.locator('#fp-email').fill(email);
  await page.getByRole('button', { name: 'Холбоос илгээх' }).click();
  await expect(page.getByText('Хэрэв энэ имэйлээр бүртгэл байгаа бол')).toBeVisible();
  await page.goto(`/reset-password?token=${encodeURIComponent(await mailToken(email, '/reset-password'))}`);
  await page.locator('#rp1').fill('Second12345');
  await page.locator('#rp2').fill('Second12345');
  await page.getByRole('button', { name: 'Нууц үг шинэчлэх' }).click();
  await expect(page.getByText('Нууц үг шинэчлэгдлээ')).toBeVisible();
  await uiLogin(page, email, 'Second12345');
  // Сэргээх холбоос имэйлийг эзэмшиж буйг нотолсон тул баталгаажсан
  await expect(page.getByText('баталгаажуулаагүй байна')).toHaveCount(0);
});
