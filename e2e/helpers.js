// E2E туслах: ажилтны TOTP код (seed-ийн мэдэгдэж буй нууц), имэйлийн outbox-оос токен унших.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { codeAt, currentStep } from '../server/src/lib/totp.js';

/** E2E серверийн seed ажилтанд урьдчилан тохируулсан 2FA нууц (зөвхөн туршилтын сан). */
export const E2E_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const MAIL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.mail');
export const H = { 'X-Requested-With': 'civiz' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Playwright төсөл бүр тусдаа процесст ажилладаг тул ашигласан алхмыг файлд хадгална (E2E сервер эхлэхэд цэвэрлэгдэнэ)
const STATE = path.join(MAIL_DIR, 'totp-state.json');
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
};

/** Сервер ижил алхмыг дахин хүлээж авахгүй (replay) тул хэрэглэгч бүрд шинэ алхмын код. */
export async function totp(email, secret = E2E_MFA_SECRET) {
  const state = readState();
  const step = Math.max(currentStep(), (state[email] ?? -1) + 1);
  while (step > currentStep() + 1) await sleep(1000);
  fs.mkdirSync(MAIL_DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ ...readState(), [email]: step }));
  return codeAt(secret, step);
}

/** Тухайн хаяг руу ирсэн хамгийн сүүлийн захидлаас `pathPart` холбоосын токен. */
export async function mailToken(email, pathPart) {
  let found = null;
  await expect
    .poll(
      () => {
        if (!fs.existsSync(MAIL_DIR)) return null;
        const files = fs
          .readdirSync(MAIL_DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();
        for (const f of files) {
          const m = JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), 'utf8'));
          if (m.to === email && m.text.includes(pathPart)) {
            found = decodeURIComponent(m.text.match(/token=([^\s&]+)/)[1]);
            return found;
          }
        }
        return null;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();
  return found;
}

/** Ажилтныг API-аар нэвтрүүлнэ (2FA кодтой). */
export async function staffApiLogin(ctx, email, password) {
  const r = await ctx.request.post('/api/auth/login', { headers: H, data: { email, password } });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  if (body.mfa) {
    const v = await ctx.request.post('/api/auth/mfa/verify', { headers: H, data: { code: await totp(email) } });
    expect(v.ok(), await v.text()).toBeTruthy();
  }
}

/** UI-аар нэвтрэх; ажилтан бол 2FA кодын хуудсыг бөглөнө. */
export async function uiLogin(page, email, password, { staff = false } = {}) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#pw').fill(password);
  await page.getByRole('button', { name: 'Нэвтрэх' }).click();
  if (staff) {
    await expect(page).toHaveURL(/\/login\/mfa\?mode=VERIFY/);
    await page.locator('#mfa-code').fill(await totp(email));
    await page.getByRole('button', { name: 'Баталгаажуулах' }).click();
  }
  await expect(page.getByRole('button', { name: 'Гарах' })).toBeVisible();
}

/** Зочны header: mobile (≤860px) бол hamburger цэсийг нээнэ — хэл, горим, хэсгийн холбоосууд түүн дотор */
export async function openGuestMenu(page) {
  const burger = page.locator('.g-burger');
  if ((await burger.isVisible()) && (await burger.getAttribute('aria-expanded')) !== 'true') await burger.click();
}
