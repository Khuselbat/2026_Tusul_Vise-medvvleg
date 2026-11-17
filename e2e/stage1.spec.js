// Үе 1 UI: нэмэлт материал → “Бүрэн” → хүргүүлсэн → албан үр дүн бүртгэх → оператор тулгах → өмнөх мэдүүлэг импортлох.
// Урьдчилсан нөхцөлийг (илгээлт, хуваарилалт, “Дутуу”) API-аар бэлтгэж, Үе 1-ийн дэлгэцүүдийг хөтчөөр шалгана.
import { test, expect } from '@playwright/test';

const H = { 'X-Requested-With': 'civiz' };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
const ok = async (res) => {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
};

async function signIn(ctx, email, password) {
  await ok(await ctx.request.post('/api/auth/login', { headers: H, data: { email, password } }));
}

test('Үе 1: нэмэлт материал, хүргүүлсэн, албан үр дүн, импорт', async ({ browser }, testInfo) => {
  const applicant = await browser.newContext();
  const operator = await browser.newContext();
  const admin = await browser.newContext();
  const email = `s1.${testInfo.project.name}.${Date.now()}@example.com`;
  const pw = 'Stage1Test1234';

  // ── Бэлтгэл (API) ──
  await ok(
    await applicant.request.post('/api/auth/register', {
      headers: H,
      data: { displayName: 'Үе Нэг', email, password: pw, passwordConfirm: pw },
    }),
  );
  await signIn(applicant, email, pw);
  await signIn(operator, 'operator@civiz.mn', 'Operator1234');
  await signIn(admin, 'admin@civiz.mn', 'Admin1234');

  const { visas } = await ok(await applicant.request.get('/api/visas'));
  const versionId = visas.find((v) => v.code === 'C-3-9').versionId;
  const { visa } = await ok(await applicant.request.get(`/api/visas/${versionId}`));
  const req = Object.fromEntries(visa.requirements.map((r) => [r.code, r.id]));
  const { publicId: ref } = await ok(
    await applicant.request.post('/api/app/drafts', { headers: H, data: { versionId, idempotencyKey: crypto.randomUUID() } }),
  );
  await ok(
    await applicant.request.put(`/api/app/drafts/${ref}/form`, {
      headers: H,
      data: {
        familyName: 'Bat',
        givenName: 'Bold',
        birthDate: '1991-02-03',
        nationalityCode: 'MN',
        passportNumber: 'E1122334',
        passportExpiresOn: day(2000),
        contactEmail: email,
        contactPhone: '+976 9911 2233',
        travelPurpose: 'Аялал',
        intendedEntryOn: day(30),
        intendedExitOn: day(40),
      },
    }),
  );
  for (const [code, buffer, name, mimeType] of [
    ['FORM_PHOTO', PNG, 'photo.png', 'image/png'],
    ['PASSPORT_COPY', PDF, 'passport.pdf', 'application/pdf'],
    ['FINANCIAL', PDF, 'bank.pdf', 'application/pdf'],
  ]) {
    await ok(
      await applicant.request.post(`/api/app/drafts/${ref}/documents`, {
        headers: H,
        multipart: { requirementId: String(req[code]), file: { name, mimeType, buffer } },
      }),
    );
  }
  await ok(await applicant.request.post(`/api/app/drafts/${ref}/submit`, { headers: H }));
  const { operators } = await ok(await admin.request.get('/api/admin/assignments'));
  const opId = operators.find((o) => o.name === 'Оператор Сараа').id;
  await ok(await admin.request.put(`/api/admin/assignments/${ref}`, { headers: H, data: { operatorId: opId, expectedOperatorId: null } }));
  await ok(
    await operator.request.post(`/api/operator/applications/${ref}/reviews`, {
      headers: H,
      data: { completeness: 'INCOMPLETE', comment: 'Банкны хуулга сүүлийн 3 сарын байх.', expectedReviewNo: 0 },
    }),
  );

  const ap = await applicant.newPage();
  const op = await operator.newPage();

  // ── 1.1 Мэдүүлэгч нэмэлт материал илгээнэ ──
  await ap.goto(`/app/applications/${ref}`);
  await expect(ap.getByText('Оператор нэмэлт материал шаардсан')).toBeVisible();
  await ap.getByRole('button', { name: 'Нэмэлт материал бэлтгэх' }).click();
  await ap.locator('#sup-req').selectOption(String(req.FINANCIAL));
  await ap.locator('#sup-file').setInputFiles({ name: 'bank-3m.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(ap.getByRole('button', { name: 'bank-3m.pdf' })).toBeVisible();
  await ap.locator('#sup-note').fill('Сүүлийн 3 сарын хуулга.');
  await ap.getByRole('button', { name: 'Нэмэлт материал илгээх' }).last().click();
  await ap.getByRole('dialog').getByRole('button', { name: 'Илгээх' }).click();
  await expect(ap.getByText('Багц #1')).toBeVisible();
  await expect(ap.getByText('Бүрдэл хянаж байна').first()).toBeVisible();
  await expect(ap.getByRole('heading', { name: 'Хавсралт (анхны илгээлт)' })).toBeVisible();

  // ── Оператор багцыг харж “Бүрэн”, дараа нь хүргүүлсэн гэж бүртгэнэ ──
  await op.goto(`/operator/applications/${ref}`);
  await expect(op.getByText('Багц #1')).toBeVisible();
  await op.getByRole('radio', { name: 'Бүрэн' }).check();
  await op.getByRole('button', { name: 'Үнэлгээ хадгалах' }).click();
  await op.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(op.getByRole('heading', { name: 'Хүргүүлсэн гэж бүртгэх' })).toBeVisible();
  await op.locator('#ho-auth').fill('KVAC Mongolia');
  await op.locator('#ho-ref').fill('KVAC-E2E-0001');
  await op.locator('#ho-file').setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: PDF });
  await op.getByRole('button', { name: 'Хүргүүлсэн гэж бүртгэх' }).click();
  await op.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(op.getByRole('heading', { name: 'Эрх бүхий байгууллагад хүргүүлсэн' })).toBeVisible();
  await expect(op.getByRole('button', { name: 'Үнэлгээ хадгалах' })).toHaveCount(0);

  // ── 1.2 Мэдүүлэгч албан дугаарыг харж, порталын үр дүнгээ бүртгэнэ ──
  await ap.reload();
  await expect(ap.getByText('KVAC-E2E-0001')).toBeVisible();
  await ap.getByRole('button', { name: 'Үр дүн бүртгэх' }).click();
  const dlg = ap.getByRole('dialog');
  await expect(dlg.getByText('Энэ нь системийн шийдвэр биш')).toBeVisible();
  await dlg.locator('#or-outcome').selectOption('PENDING');
  await dlg.locator('#or-file').setInputFiles({ name: 'portal.png', mimeType: 'image/png', buffer: PNG });
  await dlg.getByRole('button', { name: 'Бүртгэх' }).click();
  await expect(ap.getByText('Шийдвэр хүлээж байна')).toBeVisible();
  await expect(ap.getByText('Баталгаажаагүй')).toBeVisible();

  // ── Оператор нотолгоотой тулгана (мэдүүлэгчийн бичлэг өөрчлөгдөхгүй) ──
  await op.reload();
  await op.getByRole('button', { name: 'Нотолгоотой тулгах' }).click();
  await op.getByRole('radio', { name: 'Нотолгоотой таарч байна' }).check();
  await op.getByRole('dialog').getByRole('button', { name: 'Хадгалах' }).click();
  await expect(op.getByText('Оператор нотолгоотой тулгасан')).toBeVisible();
  await ap.reload();
  await expect(ap.getByText('Оператор нотолгоотой тулгасан')).toBeVisible();
  await expect(ap.getByText('Шийдвэр хүлээж байна')).toBeVisible();

  // ── 1.3 Өмнөх мэдүүлэг импортлох ба устгах ──
  await ap.goto('/app/imports/new');
  await ap.locator('#im-cat').fill('C-3-9');
  await ap.locator('#im-date').fill('2024-04-01');
  await ap.locator('#im-auth').fill('KVAC');
  await ap.locator('#im-files').setInputFiles([{ name: 'old-visa.pdf', mimeType: 'application/pdf', buffer: PDF }]);
  await ap.getByRole('button', { name: 'Хадгалах' }).click();
  await expect(ap).toHaveURL(/\/app\/imports\/IMP-/);
  await expect(ap.getByText('Импортолсон · баталгаажаагүй')).toBeVisible();
  await expect(ap.getByRole('button', { name: 'old-visa.pdf' })).toBeVisible();
  await ap.getByRole('button', { name: 'Устгах' }).click();
  await ap.getByRole('dialog').getByRole('button', { name: 'Устгах' }).click();
  await expect(ap).toHaveURL(/\/app\/imports$/);
  await expect(ap.getByText('Өмнөх мэдүүлэг нэмээгүй байна')).toBeVisible();

  await Promise.all([applicant.close(), operator.close(), admin.close()]);
});
