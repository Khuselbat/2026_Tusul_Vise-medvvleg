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
    /** multipart: fields + файлууд [{field, buf, name}] */
    multipart: (u, fields = {}, files = []) => {
      let r = h(agent.post(u));
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) r = r.field(k, String(v));
      for (const f of files) r = r.attach(f.field || 'file', f.buf, f.name);
      return r;
    },
  };
}

export async function login(app, user) {
  const c = client(app);
  const r = await c.post('/api/auth/login', { email: user.email, password: user.password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}

/** Шинэ мэдүүлэгч бүртгэж нэвтэрнэ. */
export async function newApplicant(app, tag = uuid().slice(0, 8)) {
  const u = { email: `t.${tag}@example.com`, password: 'Applicant1234', name: `Тест ${tag}` };
  const c = client(app);
  const r = await c.post('/api/auth/register', { displayName: u.name, email: u.email, password: u.password, passwordConfirm: u.password });
  assert.equal(r.status, 201, JSON.stringify(r.body));
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
