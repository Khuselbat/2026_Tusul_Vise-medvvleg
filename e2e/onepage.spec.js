// Зочны нэг урт нүүр хуудас: тогтмол header/footer, хэсэг рүү гүйлгэх цэс (scroll-spy), mobile цэс,
// ★ хариу шалгах маягт, хуучин хаягийн redirect, нэвтэрсэн хэрэглэгчийн layout хэвээр.
/* global window, document -- page.evaluate() дотор браузерт ажиллана */
import { test, expect } from '@playwright/test';
import { uiLogin, H, mailToken, openGuestMenu } from './helpers.js';

const SECTIONS = [
  ['visas', 'Мэдээлэл'],
  ['check', 'Хариу шалгах'],
  ['how', 'Хэрхэн'],
  ['faq', 'FAQ'],
  ['contact', 'Холбоо барих'],
];
const isMobile = (page) => page.viewportSize().width <= 860;
const box = (page, sel) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().toJSON());

test('header ба footer гүйлгэхэд байрандаа, агуулга доор нь далдлагдахгүй, sidebar-гүй', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Визийн мэдээлэл нэг дор');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  const vh = page.viewportSize().height;
  const f0 = await box(page, '.g-footer');
  expect(Math.round(f0.bottom)).toBe(vh);
  await page.evaluate(() => window.scrollTo(0, 1800));
  await page.waitForTimeout(300);
  const h1 = await box(page, '.g-header');
  const f1 = await box(page, '.g-footer');
  expect(h1.top).toBe(0);
  expect(Math.round(f1.bottom)).toBe(vh);
  expect(f1.top).toBe(f0.top);
  // Хамгийн доор гүйлгэхэд сүүлийн агуулга footer-ийн дээр бүрэн харагдана
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const lastCard = await box(page, '#contact .card:last-of-type');
  expect(lastCard.bottom).toBeLessThanOrEqual(f1.top);
  // Хэвтээ гүйлт байхгүй
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test('цэсний холбоос бүр хэсэг рүү гүйлгэж, идэвхтэй болж, hash шинэчлэгдэнэ', async ({ page }) => {
  await page.goto('/');
  await page.locator('.g-header').waitFor();
  for (const [id, label] of SECTIONS) {
    await openGuestMenu(page);
    await page.getByRole('navigation', { name: 'Хуудасны хэсгүүд' }).getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`/#${id}$`));
    const header = await box(page, '.g-header');
    await expect
      .poll(async () => Math.round((await box(page, `#${id}`)).top), { message: `#${id} header-ийн доор` })
      .toBeGreaterThanOrEqual(Math.round(header.bottom) - 1);
    await expect(page.locator(`#${id}`)).toBeInViewport();
    if (id !== 'contact' || !isMobile(page)) {
      await expect(page.locator('.g-nav [aria-current="location"]') /* mobile-д хаалттай цэс a11y модноос гардаг */).toHaveAttribute(
        'href',
        `/#${id}`,
      );
    }
    if (isMobile(page)) await expect(page.locator('#guest-menu')).toBeHidden(); // сонгоход хаагдана
  }
  // "Дээш буцах" товч
  await page.getByRole('button', { name: 'Дээш буцах' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});

test('/#faq шууд хаягаар тухайн хэсэг рүү очиж, accordion гараар нээгдэнэ', async ({ page }) => {
  await page.goto('/#faq');
  await expect(page.getByRole('heading', { name: 'Түгээмэл асуулт' })).toBeInViewport();
  const first = page.locator('#faq summary').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#faq details').first()).toHaveAttribute('open', '');
  await expect(page.locator('#faq details p').first()).toBeVisible();
});

test('mobile цэс: hamburger-ээр нээгдэж, Esc болон гадна дарахад хаагдана', async ({ page }) => {
  test.skip(!isMobile(page), 'зөвхөн mobile');
  await page.goto('/');
  const burger = page.getByRole('button', { name: 'Цэс' });
  const menu = page.locator('#guest-menu');
  await expect(menu).toBeHidden();
  // Нэвтрэх, Бүртгүүлэх нь цэсгүйгээр харагдана
  await expect(page.locator('.g-auth').getByRole('link', { name: 'Нэвтрэх' })).toBeVisible();
  await burger.click();
  await expect(burger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('link', { name: 'FAQ' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(burger).toBeFocused();
  await burger.click();
  await expect(menu).toBeVisible();
  await page.locator('#check').click({ position: { x: 5, y: 5 } });
  await expect(menu).toBeHidden();
});

test('★ хариу шалгах: формат шалгаж, мэдээллийг сервер рүү илгээхгүй бэлдэнэ, порталыг Confirm-оор нээнэ', async ({ page }) => {
  const sent = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) sent.push(`${r.method()} ${r.url()} ${r.postData() || ''}`);
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Хариугаа шалгах' }).click();
  await expect(page).toHaveURL(/#check$/);
  const check = page.locator('#check');
  await expect(check.getByRole('heading', { name: 'Визийн хариу шалгах' })).toBeVisible();
  await check.getByRole('button', { name: 'Хариу шалгахад бэлдэх' }).click();
  await expect(check.locator('.field-error')).toHaveCount(4);
  await expect(check.getByLabel('Мэдүүлгийн төрөл')).toBeFocused();

  await check.getByLabel('Мэдүүлгийн төрөл').selectOption({ index: 1 });
  await check.getByRole('textbox', { name: 'Паспортын дугаар' }).fill('e12');
  await check.getByRole('textbox', { name: 'Англи нэр' }).fill('Бат');
  await check.getByLabel('Төрсөн огноо').fill('1990-05-17');
  await check.getByRole('button', { name: 'Хариу шалгахад бэлдэх' }).click();
  await expect(check.getByText('Паспортын дугаар латин том үсэг, цифрээс бүрдэх 6–9 тэмдэгт байна (ж: E1234567).')).toBeVisible();
  await expect(check.getByText('Паспорт дээрх латин бичлэгээр, зөвхөн латин үсгээр бичнэ (ж: BAT BOLD).')).toBeVisible();

  await check.getByRole('textbox', { name: 'Паспортын дугаар' }).fill('e1234567');
  await expect(check.getByRole('textbox', { name: 'Паспортын дугаар' })).toHaveValue('E1234567');
  await check.getByRole('textbox', { name: 'Англи нэр' }).fill('bat bold');
  await check.getByRole('button', { name: 'Хариу шалгахад бэлдэх' }).click();
  const ready = check.locator('.check-ready');
  await expect(ready.getByRole('heading', { name: 'Мэдээлэл бэлэн — албан порталаар шалгана уу' })).toBeVisible();
  await expect(ready).toContainText('BAT BOLD');
  await expect(ready).toContainText('E1••••67'); // дугаар далдлагдсан
  await expect(ready).not.toContainText(/зөвшөөр|татгалзсан байна|approved/i); // шийдвэр зохиохгүй

  // Хүлээн авсан дугаараар
  await check.getByRole('radio', { name: 'Хүлээн авсан дугаар' }).check();
  await expect(ready).toHaveCount(0); // өөрчлөхөд бэлтгэл цэвэрлэгдэнэ

  await check.getByRole('button', { name: 'Албан порталаар шалгах ↗' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Гадаад сайт руу шилжих' });
  await expect(dlg).toContainText('www.visa.go.kr');
  await dlg.getByRole('button', { name: 'Цуцлах' }).click();
  await expect(dlg).toHaveCount(0);

  // Оруулсан мэдээлэл сервер рүү огт явахгүй, хөтчийн storage-д ч хадгалагдахгүй
  expect(sent.filter((s) => /E1234567|BAT BOLD|1990-05-17/.test(s))).toEqual([]);
  expect(sent.every((s) => s.startsWith('GET '))).toBe(true);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toMatch(/E1234567|BAT BOLD/);
});

test('визийн мэдээлэл: улсаар шүүж, карт дарахад /visas/:id дэлгэрэнгүй', async ({ page }) => {
  await page.goto('/#visas');
  const visas = page.locator('#visas');
  await visas.getByRole('button', { name: 'Мэдээлэл үзэх →' }).first().click();
  await expect(visas.getByLabel('Улс')).toHaveValue('KR');
  await visas.getByLabel('Нэр эсвэл код').fill('байхгүй-ангилал-xyz');
  await visas.getByRole('button', { name: 'Хайх' }).click();
  await expect(visas.getByRole('heading', { name: 'Үр дүн олдсонгүй' })).toBeVisible();
  await visas.getByRole('button', { name: 'Хайлтаа өөрчлөх' }).click();
  await visas.getByRole('link', { name: /C-3-9/ }).first().click();
  await expect(page).toHaveURL(/\/visas\/\d+$/);
  await expect(page.getByText('Гадаад паспортын хуулбар')).toBeVisible();
  // Дэлгэрэнгүйгээс цэсээр нэг хуудасны хэсэг рүү буцна
  await openGuestMenu(page);
  await page.getByRole('navigation', { name: 'Хуудасны хэсгүүд' }).getByRole('link', { name: 'FAQ' }).click();
  await expect(page).toHaveURL(/\/#faq$/);
  await expect(page.getByRole('heading', { name: 'Түгээмэл асуулт' })).toBeInViewport();
});

test('хуучин зочны хаяг нэг хуудасны хэсэг рүү чиглэнэ; нэвтэрсэн хэрэглэгчид хэвээр', async ({ page, browser }, testInfo) => {
  await page.goto('/visas?country=KR');
  await expect(page).toHaveURL(/\/\?country=KR#visas$/);
  await expect(page.locator('#visas').getByLabel('Улс')).toHaveValue('KR');
  await expect(page.locator('#visas')).toBeInViewport();
  await page.goto('/help');
  await expect(page).toHaveURL(/\/#contact$/);
  await expect(page.getByRole('heading', { name: 'Холбоо барих (албан ёсны эх сурвалж)' })).toBeVisible();
  for (const p of ['/login', '/register']) {
    await page.goto(p);
    await expect(page).toHaveURL(new RegExp(`${p}$`));
    await expect(page.locator('.g-header')).toBeVisible();
  }

  // Нэвтэрсэн мэдүүлэгч: sidebar, /visas, /help, нүүр хэвээр
  const email = `onepage.${testInfo.project.name}.${Date.now()}@example.com`;
  const ctx = await browser.newContext();
  await ctx.request.post('/api/auth/register', {
    headers: H,
    data: { displayName: 'Нэг хуудас', email, password: 'OnePage1234', passwordConfirm: 'OnePage1234' },
  });
  await ctx.request.post('/api/auth/verify-email', { headers: H, data: { token: await mailToken(email, '/verify-email') } });
  const ap = await ctx.newPage();
  await uiLogin(ap, email, 'OnePage1234');
  await expect(ap.locator('.sidebar')).toHaveCount(1);
  await expect(ap.locator('.g-header')).toHaveCount(0);
  await ap.goto('/visas');
  await expect(ap).toHaveURL(/\/visas$/);
  await expect(ap.getByRole('heading', { name: 'Визийн мэдээлэл хайх', level: 1 })).toBeVisible();
  await ap.goto('/help');
  await expect(ap.getByRole('heading', { name: 'Мэдээллийн заавар', level: 1 })).toBeVisible();
  await ap.goto('/');
  await expect(ap.getByRole('heading', { name: 'Нүүр хуудас', level: 1 })).toBeVisible();
  await ctx.close();
});
