// Профайл + бичиг баримтын сан → шинэ мэдүүлэг автоматаар бөглөгдөх (санал), баримт хуулагдаж хавсрагдах;
// имэйл “Дахин илгээх”-ийн хүлээлт; админы туршилтын имэйл; мэдээллээ PDF-ээр татах.
import { test, expect } from '@playwright/test';
import { uiLogin, staffApiLogin, mailToken, H } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);

test('Профайл → баримтын сан → автоматаар бөглөсөн мэдүүлэг → PDF татах', async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const email = `s6.${testInfo.project.name}.${Date.now()}@example.com`;
  const pw = 'Stage6Test1234';
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Үе Зургаа', email, password: pw, passwordConfirm: pw },
  });
  const ap = await ctx.newPage();
  await uiLogin(ap, email, pw);

  // Имэйл баталгаажаагүй — “Дахин илгээх”: бүртгэлээс 60 сек болоогүй тул хүлээлт, тоолуур
  await ap.getByRole('button', { name: 'Дахин илгээх' }).click();
  await expect(ap.getByText(/секунд хүлээнэ үү/)).toBeVisible();
  await expect(ap.getByRole('button', { name: /Дахин илгээх \(\d+ сек\)/ })).toBeDisabled();
  await ctx.request.post('/api/auth/verify-email', { headers: H, data: { token: await mailToken(email, '/verify-email') } });

  // 1. Хувийн мэдээлэл
  await ap.goto('/app/profile');
  await ap.locator('#pf-familyName').fill('Bold');
  await ap.locator('#pf-givenName').fill('Saraa');
  await ap.locator('#pf-birthDate').fill('1996-02-03');
  await ap.locator('#pf-sex').selectOption('F');
  await ap.locator('#pf-nationalityCode').fill('MN');
  await ap.locator('#pf-maritalStatus').selectOption('SINGLE');
  await ap.locator('#pf-passportNumber').fill('E5544332');
  await ap.locator('#pf-passportIssuedOn').fill('2023-03-03');
  await ap.locator('#pf-passportExpiresOn').fill(day(2500));
  await ap.locator('#pf-contactPhone').fill('+976 8811 2233');
  await ap.locator('#pf-employerOrSchool').fill('МУИС');
  await ap.getByRole('button', { name: 'Хувийн мэдээлэл хадгалах' }).click();
  await expect(ap.getByText('Хувийн мэдээлэл хадгалагдлаа.')).toBeVisible();

  // 2. Бичиг баримтын сан: зураг, паспорт (хүчинтэй), банкны хуулга (хугацаа дууссан → анхааруулга)
  await ap.goto('/app/documents');
  const add = async (type, file, validUntil) => {
    await ap.locator('#nd-type').selectOption(type);
    if (validUntil) await ap.locator('#nd-valid').fill(validUntil);
    await ap.locator('#nd-file').setInputFiles(file);
    await ap.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(ap.getByText('Баримт хадгалагдлаа.').last()).toBeVisible();
  };
  await add('PHOTO', { name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await add('PASSPORT_COPY', { name: 'passport.pdf', mimeType: 'application/pdf', buffer: PDF }, day(900));
  await add('BANK_STATEMENT', { name: 'bank-old.pdf', mimeType: 'application/pdf', buffer: PDF }, day(-3));
  await expect(ap.getByText('Хугацааны анхааруулга')).toBeVisible();
  await expect(ap.getByRole('cell', { name: /bank-old\.pdf/ })).toBeVisible();

  // 3. Шинэ мэдүүлэг: анкет профайлаас бөглөгдөнө (санал), аяллын мэдээллийг хэрэглэгч оруулна
  await ap.goto('/app/new');
  await expect(ap.getByText(/материал/).first()).toBeVisible();
  await ap.getByRole('link', { name: 'Сонгох' }).first().click();
  await expect(ap.getByText(/Профайлаас \d+ талбар автоматаар бөглөгдлөө/)).toBeVisible();
  await expect(ap.locator('#familyName')).toHaveValue('BOLD');
  await expect(ap.locator('#passportNumber')).toHaveValue('E5544332');
  await expect(ap.locator('#x-sex')).toHaveValue('F');
  await ap.locator('#contactEmail').fill(email);
  await ap.locator('#intendedEntryOn').fill(day(40));
  await ap.locator('#intendedExitOn').fill(day(50));
  await ap.locator('#travelPurpose').fill('Аялал жуулчлал');
  await ap.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();

  // 4. Материал: тохирох баримт хуулагдаж хавсрагдана; хугацаа дууссаныг хавсаргахгүй
  await expect(ap).toHaveURL(/\/app\/new\/documents/);
  await expect(ap.getByText(/2 баримтыг хуулж хавсаргалаа/)).toBeVisible();
  await expect(ap.getByText(/bank-old\.pdf — хавсаргаагүй/)).toBeVisible();
  await expect(ap.locator('.file-line .badge', { hasText: 'Профайлаас' })).toHaveCount(2);

  // 5. Мэдээллээ татах — нэг PDF
  await ap.goto('/app/profile');
  await ap.getByRole('button', { name: 'Бүх мэдээллээ татах (PDF)' }).click();
  await ap.getByRole('dialog').locator('input[type="password"]').fill(pw);
  const [dl] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('dialog').getByRole('button', { name: /Татах/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^civiz-export-\d{8}\.pdf$/);
  await ctx.close();
});

test('Админ: имэйлийн тохиргоо ба туршилтын имэйл', async ({ browser }) => {
  const ad = await browser.newContext();
  await staffApiLogin(ad, 'admin@civiz.mn', 'Admin1234');
  const page = await ad.newPage();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Имэйл (SMTP)' })).toBeVisible();
  await page.getByRole('button', { name: 'Туршилтын имэйл илгээх' }).click();
  await expect(page.getByText(/Туршилтын имэйл admin@civiz\.mn хаяг руу илгээгдлээ/)).toBeVisible();
  await ad.close();
});
