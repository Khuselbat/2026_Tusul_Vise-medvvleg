// Үе 4 UI: анкетын автомат хадгалалт (дахин ачаалахад сэргэнэ), PDF хураангуй, олноор хуваарилах, операторын хайлт, статистик.
import { test, expect } from '@playwright/test';
import { uiLogin, staffApiLogin, mailToken, H } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);

async function submitViaApi(ctx, email) {
  const { visas } = await (await ctx.request.get('/api/visas')).json();
  const versionId = visas.find((v) => v.code === 'C-3-9').versionId;
  const { visa } = await (await ctx.request.get(`/api/visas/${versionId}`)).json();
  const req = Object.fromEntries(visa.requirements.map((r) => [r.code, r.id]));
  const { publicId } = await (
    await ctx.request.post('/api/app/drafts', { headers: H, data: { versionId, idempotencyKey: crypto.randomUUID() } })
  ).json();
  await ctx.request.put(`/api/app/drafts/${publicId}/form`, {
    headers: H,
    data: {
      familyName: 'Bat',
      givenName: 'Erdene',
      birthDate: '1992-03-04',
      nationalityCode: 'MN',
      passportNumber: 'E5566778',
      passportExpiresOn: day(2000),
      contactEmail: email,
      contactPhone: '+976 9911 0000',
      travelPurpose: 'Аялал',
      intendedEntryOn: day(30),
      intendedExitOn: day(40),
    },
  });
  for (const [code, buffer, name, mimeType] of [
    ['FORM_PHOTO', PNG, 'p.png', 'image/png'],
    ['PASSPORT_COPY', PDF, 'pp.pdf', 'application/pdf'],
    ['FINANCIAL', PDF, 'b.pdf', 'application/pdf'],
  ]) {
    await ctx.request.post(`/api/app/drafts/${publicId}/documents`, {
      headers: H,
      multipart: { requirementId: String(req[code]), file: { name, mimeType, buffer } },
    });
  }
  const s = await ctx.request.post(`/api/app/drafts/${publicId}/submit`, { headers: H });
  expect(s.ok(), await s.text()).toBeTruthy();
  return publicId;
}

test('Үе 4: автомат хадгалалт, PDF, олноор хуваарилах, хайлт, статистик', async ({ browser }, testInfo) => {
  const email = `s4.${testInfo.project.name}.${Date.now()}@example.com`;
  const pw = 'Stage4Test1234';
  const apCtx = await browser.newContext({ acceptDownloads: true });
  const adCtx = await browser.newContext();
  const opCtx = await browser.newContext();
  await apCtx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Үе Дөрөв', email, password: pw, passwordConfirm: pw },
  });
  await apCtx.request.post('/api/auth/verify-email', { headers: H, data: { token: await mailToken(email, '/verify-email') } });
  const ap = await apCtx.newPage();
  await uiLogin(ap, email, pw);

  // ── Автомат хадгалалт: бичээд хүлээх → дахин ачаалахад сэргэнэ ──
  await ap.goto('/app/new');
  await ap.getByRole('link', { name: 'Сонгох' }).first().click();
  await ap.locator('#familyName').fill('Autosave');
  await ap.locator('#passportNumber').fill('AS123456');
  await expect(ap.getByText('Ноорог автоматаар хадгалагдсан')).toBeVisible({ timeout: 10_000 });
  await expect(ap).toHaveURL(/\/app\/new\?draft=/);
  await ap.reload();
  await expect(ap.getByText('Өмнө автоматаар хадгалсан ноорог сэргээгдлээ')).toBeVisible();
  await expect(ap.locator('#familyName')).toHaveValue('Autosave');
  await expect(ap.locator('#passportNumber')).toHaveValue('AS123456');

  // ── PDF хураангуй ──
  const refs = [await submitViaApi(apCtx, email), await submitViaApi(apCtx, email)];
  await ap.goto(`/app/applications/${refs[0]}`);
  const [pdf] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('link', { name: 'PDF хураангуй' }).click()]);
  expect(pdf.suggestedFilename()).toBe(`${refs[0]}-summary.pdf`);

  // ── Олноор хуваарилах ──
  const ad = await adCtx.newPage();
  await uiLogin(ad, 'admin@civiz.mn', 'Admin1234', { staff: true });
  await ad.goto('/admin/assignments');
  for (const r of refs) await ad.getByRole('checkbox', { name: `${r} сонгох` }).check();
  const bar = ad.getByRole('region', { name: 'Олноор хуваарилах' });
  await expect(bar.getByText('2 сонгосон')).toBeVisible();
  const opt = await bar.getByLabel('Хуваарилах оператор').locator('option', { hasText: 'Оператор Сараа' }).getAttribute('value');
  await bar.getByLabel('Хуваарилах оператор').selectOption(opt);
  await bar.getByRole('button', { name: 'Сонгосныг хуваарилах' }).click();
  await ad.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
  for (const r of refs) await expect(ad.locator('tr', { hasText: r })).toHaveCount(0);

  // ── Операторын хайлт ──
  await staffApiLogin(opCtx, 'operator@civiz.mn', 'Operator1234');
  const op = await opCtx.newPage();
  await op.goto('/operator');
  await op.locator('#wq').fill(refs[1]);
  await op.getByRole('button', { name: 'Хайх' }).click();
  await expect(op.locator('tbody tr')).toHaveCount(1);
  await expect(op.locator('tbody tr').first()).toContainText(refs[1]);

  // ── Статистик (хувийн мэдээлэлгүй) ──
  await ad.goto('/admin/stats');
  await expect(ad.getByRole('img', { name: /Илгээсэн мэдүүлэг/ })).toBeVisible();
  await expect(ad.getByText(email)).toHaveCount(0);
  await expect(ad.getByText(refs[0])).toHaveCount(0);
  await ad
    .getByRole('img', { name: /Илгээсэн мэдүүлэг/ })
    .locator('path.bar')
    .last()
    .focus();
  await expect(ad.locator('.chart-tip')).toBeVisible();
  await ad.screenshot({ path: testInfo.outputPath('stats.png'), fullPage: true });

  await Promise.all([apCtx.close(), adCtx.close(), opCtx.close()]);
});
