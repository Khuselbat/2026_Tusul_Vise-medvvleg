// Бүтэн урсгал: зочин → бүртгэл → анкет → файл → илгээх → админ хуваарилах → оператор үнэлэх → мэдүүлэгч харах.
// UC-01, 02, 03, 04, 05, 07 + BR-08/09 (дотоод дугаар ≠ албан, "Дутуу" ≠ визийн шийдвэр).
import { test, expect } from '@playwright/test';
import { uiLogin, mailToken } from './helpers.js';

const DEMO = {
  admin: { email: 'admin@civiz.mn', password: 'Admin1234' },
  operator: { email: 'operator@civiz.mn', password: 'Operator1234', name: 'Оператор Сараа' },
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

// Ажилтан (админ, оператор) бол 2FA кодын хуудсыг бөглөнө (Үе 2)
const login = (page, email, password) => uiLogin(page, email, password, { staff: !email.startsWith('e2e.') });

async function logout(page) {
  await page.getByRole('button', { name: 'Гарах' }).click();
  await expect(page.getByRole('link', { name: 'Нэвтрэх' }).first()).toBeVisible();
}

async function attach(page, title, file) {
  const card = page.locator('.req-row').filter({ has: page.getByRole('heading', { name: title }) });
  const chooser = page.waitForEvent('filechooser');
  await card.getByRole('button', { name: 'Файл сонгох' }).click();
  await (await chooser).setFiles(file);
  await expect(card.getByText('Хавсаргасан')).toBeVisible();
}

test('мэдүүлэгчээс оператор хүртэлх бүтэн урсгал', async ({ page }, testInfo) => {
  const email = `e2e.${testInfo.project.name}.${Date.now()}@example.com`;
  const password = 'E2eTest1234';
  const reason = 'Банкны хуулга сүүлийн 3 сарын байх шаардлагатай.';

  // ── Зочин: визийн мэдээлэл (UC-03) ──
  await page.goto('/visas');
  await page.getByRole('link', { name: /C-3-9/ }).first().click();
  await expect(page.getByText('Гадаад паспортын хуулбар')).toBeVisible();
  await page.getByRole('button', { name: 'Мэдүүлэг эхлүүлэх' }).click();
  await expect(page).toHaveURL(/\/login\?next=/); // зочныг эхлээд нэвтрүүлнэ

  // ── Бүртгүүлэх (UC-01) ──
  await page.getByRole('link', { name: 'Бүртгүүлэх' }).last().click();
  await page.locator('#name').fill('Е2Е Туршилт');
  await page.locator('#email').fill(email);
  await page.locator('#pw').fill(password);
  await page.locator('#pw2').fill(password);
  await page.getByRole('button', { name: 'Бүртгүүлэх' }).click();
  await expect(page.getByText('Бүртгэл амжилттай үүслээ')).toBeVisible();
  // Үе 2: имэйлээр ирсэн холбоосоор баталгаажуулна (мэдүүлэг илгээхэд шаардлагатай)
  await page.goto(`/verify-email?token=${encodeURIComponent(await mailToken(email, '/verify-email'))}`);
  await expect(page.getByText('Имэйл хаяг баталгаажлаа')).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/); // токен хаягийн мөрөөс арилсан
  await login(page, email, password);
  await expect(page.getByText('баталгаажуулаагүй байна')).toHaveCount(0);

  // ── Анкет (UC-04, FR-04) ──
  await page.goto('/app/new');
  await page.getByRole('link', { name: 'Сонгох' }).first().click();
  await page.locator('#familyName').fill('Dorj');
  await page.locator('#givenName').fill('Saran');
  await page.locator('#birthDate').fill('1990-05-05');
  await page.locator('#nationalityCode').fill('MN');
  await page.locator('#passportNumber').fill('E7654321');
  await page.locator('#passportExpiresOn').fill(day(2000));
  await page.locator('#contactEmail').fill(email);
  await page.locator('#contactPhone').fill('+976 8800 1122');
  await page.locator('#intendedEntryOn').fill(day(30));
  await page.locator('#intendedExitOn').fill(day(40));
  await page.locator('#travelPurpose').fill('Сөүл хотод аялал жуулчлал');
  await page.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();

  // ── Хавсралт (FR-05) — заавал 3 материал ──
  await expect(page).toHaveURL(/\/app\/new\/documents/);
  await attach(page, /Визийн анкет ба цээж зураг/, { name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await attach(page, /Гадаад паспортын хуулбар/, { name: 'passport.pdf', mimeType: 'application/pdf', buffer: PDF });
  await attach(page, /Санхүүгийн чадварын нотолгоо/, { name: 'bank.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Үргэлжлүүлэх' }).click();

  // ── Хянаж илгээх (FR-06/07) ──
  await expect(page).toHaveURL(/\/app\/new\/confirm/);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Илгээх' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Илгээх' }).click();
  await expect(page).toHaveURL(/\/app\/submitted\//);
  await expect(page.getByText('архивт хадгалагдлаа')).toBeVisible();
  const ref = (await page.locator('.ref').innerText()).trim();
  expect(ref).toMatch(/^KR-\d{8}-[A-Z0-9]{6}$/);
  await expect(page.getByText('консулын визийн дугаар биш')).toBeVisible(); // BR-08
  await logout(page);

  // ── Админ: операторт хуваарилах ──
  await login(page, DEMO.admin.email, DEMO.admin.password);
  await page.goto('/admin/assignments');
  const row = page.locator('tr', { hasText: ref });
  const select = row.getByLabel('Оператор');
  const opValue = await select.locator('option', { hasText: DEMO.operator.name }).getAttribute('value');
  await select.selectOption(opValue);
  await row.getByRole('button', { name: 'Хуваарилах' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(page.locator('tr', { hasText: ref })).toHaveCount(0); // "Хуваарилаагүй" жагсаалтаас гарна
  await logout(page);

  // ── Оператор: бүрдэл үнэлэх (UC-07) ──
  await login(page, DEMO.operator.email, DEMO.operator.password);
  await page.locator('tr', { hasText: ref }).getByRole('link', { name: 'Шалгах' }).click();
  await expect(page.getByText('Гадаад паспортын хуулбар').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /зөвшөөр|татгалз/i })).toHaveCount(0); // BR-09
  await page.getByRole('radio', { name: 'Дутуу' }).check();
  await page.locator('#cm').fill(reason);
  await page.getByRole('button', { name: 'Үнэлгээ хадгалах' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(page.getByText('Дутуу — нэмэлт материал шаардсан')).toBeVisible();
  await logout(page);

  // ── Мэдүүлэгч: архиваас үр дүнгээ харах (UC-05) ──
  await login(page, email, password);
  await page.goto('/app/applications');
  await page.locator('tr, .card', { hasText: ref }).getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/app/applications/${ref}$`));
  await expect(page.getByText('Оператор нэмэлт материал шаардсан')).toBeVisible();
  await expect(page.getByText(reason).first()).toBeVisible();
  await expect(page.getByText('автоматаар татгалзсан виз гэсэн үг биш')).toBeVisible(); // BR-09

  // ── Үе 2: мэдэгдлийн хонх (илгээсэн + “Дутуу”) ──
  await page.goto('/app');
  const bell = page.getByRole('button', { name: /^Мэдэгдэл \(2 уншаагүй\)/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await page
    .getByRole('region', { name: 'Мэдэгдлүүд' })
    .getByRole('button', { name: /Нэмэлт материал шаардлагатай/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/applications/${ref}$`));
  await expect(page.getByRole('button', { name: /^Мэдэгдэл \(1 уншаагүй\)/ })).toBeVisible();
});
