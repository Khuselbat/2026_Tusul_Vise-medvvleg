// Тестийн нийтлэг туслахууд (Үе 1-ээс хойшхи тестүүд).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { one } from '../src/db.js';
import { resetDatabase } from '../src/lib/migrations.js';
import { seed, DEMO } from '../scripts/seed.js';
import { outbox } from '../src/lib/mailer.js';
import { codeAt, currentStep } from '../src/lib/totp.js';

export { DEMO };
export const PDF = Buffer.from('%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);
export const uuid = () => crypto.randomUUID();
export const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

/** Цэвэр сан + жишээ өгөгдөл + app. */
export async function setup() {
  await resetDatabase();
  await fs.rm(config.storageDir, { recursive: true, force: true });
  const ids = await seed({ withDemoApplications: true, rounds: 4 });
  ids.op2Id = (await one('SELECT user_id FROM users WHERE email = ?', [DEMO.operator2.email])).user_id;
  return { app: createApp(), ids };
}

export function client(app) {
  const agent = request.agent(app);
  const h = (r) => r.set('X-Requested-With', 'civiz');
  return {
    agent,
    get: (u) => agent.get(u),
    post: (u, b) => h(agent.post(u)).send(b ?? {}),
    put: (u, b) => h(agent.put(u)).send(b ?? {}),
    del: (u) => h(agent.delete(u)),
    upload: (u, requirementId, buf, name) => h(agent.post(u)).field('requirementId', String(requirementId)).attach('file', buf, name),
    /** multipart: fields + файлууд [{field, buf, name}] */
    multipart: (u, fields = {}, files = []) => {
      let r = h(agent.post(u));
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) r = r.field(k, String(v));
      for (const f of files) r = r.attach(f.field || 'file', f.buf, f.name);
      return r;
    },
  };
}

/* ───── 2FA (Үе 2): ажилтны TOTP. Сервер давтан алхмыг хүлээж авахгүй тул алхам бүрийг нэг удаа ашиглана. ───── */
export const mfaSecrets = new Map();
const lastStep = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function nextCode(email) {
  const secret = mfaSecrets.get(email);
  assert.ok(secret, `${email}: 2FA нууц тодорхойгүй`);
  const step = Math.max(currentStep(), (lastStep.get(email) ?? -1) + 1);
  while (step > currentStep() + 1) await sleep(1000); // ±1 цонхноос хэтрэхгүй
  lastStep.set(email, step);
  return codeAt(secret, step);
}

/** Нэвтэрнэ; ажилтан бол 2FA-г (анх бол QR бүртгэл) автоматаар гүйцэтгэнэ. */
export async function login(app, user) {
  const c = client(app);
  const r = await c.post('/api/auth/login', { email: user.email, password: user.password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (r.body.mfa === 'ENROLL') {
    const s = await c.post('/api/auth/mfa/setup');
    assert.equal(s.status, 200, JSON.stringify(s.body));
    mfaSecrets.set(user.email, s.body.secret);
    const e = await c.post('/api/auth/mfa/enable', { code: await nextCode(user.email) });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    c.recoveryCodes = e.body.recoveryCodes;
  } else if (r.body.mfa === 'VERIFY') {
    const v = await c.post('/api/auth/mfa/verify', { code: await nextCode(user.email) });
    assert.equal(v.status, 200, JSON.stringify(v.body));
  }
  return c;
}

/** Тестийн memory outbox-оос тухайн хаяг руу ирсэн сүүлийн холбоосын токен. */
export function lastMailToken(email, pathPart) {
  const m = [...outbox].reverse().find((x) => x.to === email && x.text.includes(pathPart));
  assert.ok(m, `${email}: ${pathPart} захидал олдсонгүй`);
  return decodeURIComponent(m.text.match(/token=([^\s&]+)/)[1]);
}
export { outbox };

/** Шинэ мэдүүлэгч бүртгэж нэвтэрнэ. */
export async function newApplicant(app, tag = uuid().slice(0, 8)) {
  const u = { email: `t.${tag}@example.com`, password: 'Applicant1234', name: `Тест ${tag}` };
  const c = client(app);
  const r = await c.post('/api/auth/register', { displayName: u.name, email: u.email, password: u.password, passwordConfirm: u.password });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // Үе 2: имэйлээр ирсэн холбоосоор баталгаажуулна (мэдүүлэг илгээхэд шаардлагатай)
  const v = await c.post('/api/auth/verify-email', { token: lastMailToken(u.email, '/verify-email') });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { c: await login(app, u), user: u };
}

export const validForm = () => ({
  familyName: 'Dorj',
  givenName: 'Saran',
  birthDate: '1990-05-05',
  nationalityCode: 'MN',
  passportNumber: 'E7654321',
  passportExpiresOn: future(2000),
  contactEmail: 'saran@example.com',
  contactPhone: '+976 8800 1122',
  travelPurpose: 'Аялал',
  intendedEntryOn: future(30),
  intendedExitOn: future(40),
});

/** Ноорог → анкет → заавал 3 файл → илгээх. publicId буцаана. */
export async function submitApplication(c, ids) {
  const d = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const ref = d.body.publicId;
  assert.equal((await c.put(`/api/app/drafts/${ref}/form`, validForm())).status, 200);
  for (const [code, buf, name] of [
    ['FORM_PHOTO', PNG, 'photo.png'],
    ['PASSPORT_COPY', PDF, 'passport.pdf'],
    ['FINANCIAL', PDF, 'bank.pdf'],
  ]) {
    const u = await c.multipart(`/api/app/drafts/${ref}/documents`, { requirementId: ids.reqIds[code] }, [{ buf, name }]);
    assert.equal(u.status, 201, JSON.stringify(u.body));
  }
  const s = await c.post(`/api/app/drafts/${ref}/submit`);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  return ref;
}

export async function assign(admin, ref, operatorId, expectedOperatorId = null) {
  const r = await admin.put(`/api/admin/assignments/${ref}`, { operatorId, expectedOperatorId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

export async function review(op, ref, completeness, comment = '') {
  const cur = await op.get(`/api/operator/applications/${ref}`);
  assert.equal(cur.status, 200, JSON.stringify(cur.body));
  const r = await op.post(`/api/operator/applications/${ref}/reviews`, {
    completeness,
    comment,
    expectedReviewNo: cur.body.application.reviews[0]?.reviewNo || 0,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
}
