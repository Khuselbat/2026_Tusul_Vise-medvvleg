// Интеграцын тест: FR-01…FR-11, BR-01…BR-09, NFR-01/02/05-ийг бодит MySQL/MariaDB дээр шалгана.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query, one } from '../src/db.js';
import { config } from '../src/config.js';
import { seed, DEMO } from '../scripts/seed.js';
import { resetDatabase } from '../src/lib/migrations.js';

let app;
let ids;
const PDF = Buffer.from('%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);

function client() {
  const agent = request.agent(app);
  const h = (r) => r.set('X-Requested-With', 'civiz');
  return {
    agent,
    get: (u) => agent.get(u),
    post: (u, b) => h(agent.post(u)).send(b ?? {}),
    put: (u, b) => h(agent.put(u)).send(b ?? {}),
    del: (u) => h(agent.delete(u)),
    upload: (u, requirementId, buf, name) => h(agent.post(u)).field('requirementId', String(requirementId)).attach('file', buf, name),
  };
}
async function login(user) {
  const c = client();
  const r = await c.post('/api/auth/login', { email: user.email, password: user.password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const validForm = () => ({
  familyName: 'Dorj',
  givenName: 'Saran',
  birthDate: '1990-05-05',
  nationalityCode: 'mn',
  passportNumber: 'e7654321',
  passportExpiresOn: future(2000),
  contactEmail: 'saran@example.com',
  contactPhone: '+976 8800 1122',
  travelPurpose: 'Аялал',
  intendedEntryOn: future(30),
  intendedExitOn: future(40),
});

before(async () => {
  await resetDatabase();
  await fs.rm(config.storageDir, { recursive: true, force: true });
  ids = await seed({ withDemoApplications: true, rounds: 4 });
  app = createApp();
});
after(async () => {
  await pool.end();
});

describe('UC-01/02 Бүртгэл ба нэвтрэлт', () => {
  test('FR-01: бүртгүүлэх, BR-01 давхардсан имэйл 409', async () => {
    const c = client();
    const body = { displayName: 'Шинэ хэрэглэгч', email: 'New@Example.com', password: 'Passw0rd1', passwordConfirm: 'Passw0rd1' };
    assert.equal((await c.post('/api/auth/register', body)).status, 201);
    const dup = await c.post('/api/auth/register', { ...body, email: 'new@example.com' });
    assert.equal(dup.status, 409);
    assert.ok(dup.body.error.fields.email);
    const u = await one("SELECT r.code FROM users u JOIN roles r ON r.role_id=u.role_id WHERE email='new@example.com'");
    assert.equal(u.code, 'APPLICANT');
  });

  test('бүртгэлд эрх сонгох боломжгүй (role талбарыг үл тооно)', async () => {
    const c = client();
    await c.post('/api/auth/register', {
      displayName: 'Hacker',
      email: 'h@x.mn',
      password: 'Passw0rd1',
      passwordConfirm: 'Passw0rd1',
      role: 'ADMIN',
    });
    const u = await one("SELECT r.code FROM users u JOIN roles r ON r.role_id=u.role_id WHERE email='h@x.mn'");
    assert.equal(u.code, 'APPLICANT');
  });

  test('бүртгэлийн талбарын шалгалт', async () => {
    const r = await client().post('/api/auth/register', { displayName: 'A', email: 'bad', password: 'short', passwordConfirm: 'x' });
    assert.equal(r.status, 400);
    for (const k of ['displayName', 'email', 'password']) assert.ok(r.body.error.fields[k], k);
  });

  test('FR-02: буруу нууц үг → ерөнхий алдаа, зөв бол эрхтэйгээ', async () => {
    const bad = await client().post('/api/auth/login', { email: DEMO.admin.email, password: 'wrong' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.message, 'Имэйл эсвэл нууц үг буруу байна.');
    const c = await login(DEMO.admin);
    assert.equal((await c.get('/api/auth/me')).body.user.role, 'ADMIN');
  });

  test('NFR-02: нууц үг salt-тай нэг чиглэлт хэш, ил нууц үг сан/логт 0', async () => {
    const rows = await query('SELECT password_hash FROM users');
    const hashes = rows.map((r) => r.password_hash);
    assert.equal(new Set(hashes).size, hashes.length);
    for (const h of hashes) assert.match(h, /^\$2[aby]\$/);
    const dump = JSON.stringify(await query('SELECT * FROM audit_events'));
    for (const u of Object.values(DEMO)) assert.ok(!dump.includes(u.password));
  });

  test('CSRF: X-Requested-With толгойгүй өөрчлөх хүсэлтийг хаана', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'a@b.mn', password: 'x' });
    assert.equal(r.status, 403);
  });
});

describe('UC-03 Визийн мэдээлэл', () => {
  test('FR-03: зөвхөн нийтэлсэн мэдээлэл, эх сурвалж ба огноотой', async () => {
    const r = await client().get('/api/visas');
    assert.equal(r.status, 200);
    assert.equal(r.body.visas.length, 1);
    const v = r.body.visas[0];
    assert.equal(v.code, 'C-3-9');
    assert.ok(v.sourceUrl.startsWith('https://'));
    assert.equal(v.verifiedAt, '2026-10-30');
    const d = await client().get(`/api/visas/${v.versionId}`);
    assert.equal(d.body.visa.requirements.length, 5);
    assert.equal(d.body.visa.canApply, true);
  });
  test('нийтлэгдээгүй хувилбар 404', async () => {
    const draft = await one('SELECT version_id FROM visa_info_versions WHERE published_at IS NULL');
    assert.equal((await client().get(`/api/visas/${draft.version_id}`)).status, 404);
  });
});

describe('UC-04 Мэдүүлэг илгээх', () => {
  let c;
  let ref;
  const key = crypto.randomUUID();

  before(async () => {
    c = await login(DEMO.applicant);
  });

  test('ноорог үүсгэх idempotent', async () => {
    const r1 = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: key });
    const r2 = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: key });
    assert.equal(r1.status, 201);
    assert.equal(r2.body.publicId, r1.body.publicId);
    ref = r1.body.publicId;
    assert.match(ref, /^KR-\d{8}-[A-Z2-9]{6}$/);
  });

  test('FR-04: анкетын шалгалт (ирээдүйн төрсөн огноо, гарах<орох, кирилл нэр)', async () => {
    const bad = await c.put(`/api/app/drafts/${ref}/form`, {
      ...validForm(),
      familyName: 'Дорж',
      birthDate: future(5),
      intendedExitOn: future(1),
    });
    assert.equal(bad.status, 400);
    for (const k of ['familyName', 'birthDate', 'intendedExitOn']) assert.ok(bad.body.error.fields[k], k);
    assert.equal((await c.put(`/api/app/drafts/${ref}/form`, validForm())).status, 200);
  });

  test('паспортын дугаар DB-д шифрлэгдсэн (ил утга байхгүй)', async () => {
    const f = await one(
      'SELECT f.passport_number_enc, f.family_name FROM application_forms f JOIN applications a ON a.application_id=f.application_id WHERE a.public_id=?',
      [ref],
    );
    assert.equal(f.family_name, 'DORJ');
    assert.ok(!Buffer.from(f.passport_number_enc).toString('latin1').includes('E7654321'));
  });

  test('FR-05/BR-05: зөвшөөрөгдөөгүй төрөл, хуурамч өргөтгөл, 10MB-аас их файл татгалзана', async () => {
    const r1 = await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.PASSPORT_COPY, Buffer.from('hello world, not a pdf'), 'a.txt');
    assert.equal(r1.status, 400);
    const r2 = await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.PASSPORT_COPY, PNG, 'fake.pdf');
    assert.equal(r2.status, 400);
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const r3 = await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.PASSPORT_COPY, big, 'big.pdf');
    assert.equal(r3.status, 400);
  });

  test('BR-06: дутуу хавсралттай илгээлт 422, дутуу хэсгийг заана', async () => {
    await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.FORM_PHOTO, PNG, 'photo.png').expect(201);
    const r = await c.post(`/api/app/drafts/${ref}/submit`);
    assert.equal(r.status, 422);
    assert.equal(r.body.error.missing.filter((m) => m.step === 'documents').length, 2);
  });

  test('FR-06/07 + NFR-05: илгээх, 20 давтан илгээлт давхар үүсгэхгүй', async () => {
    await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.PASSPORT_COPY, PDF, 'passport.pdf').expect(201);
    await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.FINANCIAL, PDF, 'bank.pdf').expect(201);
    const results = await Promise.all(Array.from({ length: 20 }, () => c.post(`/api/app/drafts/${ref}/submit`)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.every((r) => r.body.publicId === ref));
    const n = await one('SELECT COUNT(*) AS n FROM applications WHERE idempotency_key = ?', [key]);
    assert.equal(Number(n.n), 1);
    const a = await one('SELECT status, submitted_at, archived_at FROM applications WHERE public_id=?', [ref]);
    assert.equal(a.status, 'SUBMITTED');
    assert.ok(a.archived_at);
  });

  test('илгээсэн мэдүүлэгт файл нэмэх/анкет засах боломжгүй', async () => {
    assert.equal((await c.put(`/api/app/drafts/${ref}/form`, validForm())).status, 404);
    assert.equal((await c.upload(`/api/app/drafts/${ref}/documents`, ids.reqIds.FAMILY, PDF, 'x.pdf')).status, 404);
  });

  test('FR-08: архив жагсаалт ба дэлгэрэнгүй, паспорт далдлагдсан', async () => {
    const list = await c.get('/api/app/applications');
    assert.equal(list.body.total, 4);
    const d = await c.get(`/api/app/applications/${ref}`);
    assert.equal(d.status, 200);
    assert.equal(d.body.application.form.passportNumber, '•••••321');
    assert.equal(d.body.application.documents.length, 3);
    const file = await c.get(`/api/files/${d.body.application.documents[0].id}`);
    assert.equal(file.status, 200);
  });

  test('BR-03 / UC-04 E1: идэвхгүй улсын мэдүүлгийг хориглоно', async () => {
    const admin = await login(DEMO.admin);
    const cid = (await admin.post('/api/admin/countries', { isoCode: 'JP', nameMn: 'Япон', serviceStatus: 'COMING_SOON' })).body.id;
    const tid = (await admin.post('/api/admin/visa-types', { countryId: cid, code: 'TOUR', isActive: true })).body.id;
    const vid = (
      await admin.post(`/api/admin/visa-types/${tid}/versions`, {
        nameMn: 'Аялал',
        sourceUrl: 'https://example.org/jp',
        verifiedAt: '2026-10-30',
      })
    ).body.id;
    await admin.post(`/api/admin/versions/${vid}/requirements`, { code: 'P', title: 'Паспорт', isRequired: true });
    await admin.post(`/api/admin/versions/${vid}/publish`).expect(200);
    const r = await c.post('/api/app/drafts', { versionId: vid, idempotencyKey: crypto.randomUUID() });
    assert.equal(r.status, 403);
    // ACTIVE болгосон ч SUBMITTABLE_COUNTRIES-д байхгүй тул хаалттай хэвээр
    await admin.put(`/api/admin/countries/${cid}`, { isoCode: 'JP', nameMn: 'Япон', serviceStatus: 'ACTIVE' });
    assert.equal((await c.post('/api/app/drafts', { versionId: vid, idempotencyKey: crypto.randomUUID() })).status, 403);
  });
});

describe('NFR-01 Хандалтын хяналт (сөрөг тест)', () => {
  test('өөр мэдүүлэгчийн мэдүүлэг, файл, ноорогт хандах — 20 оролдлогоос задрал 0', async () => {
    const c = client();
    await c.post('/api/auth/register', { displayName: 'Other', email: 'other@x.mn', password: 'Passw0rd1', passwordConfirm: 'Passw0rd1' });
    const o = await login({ email: 'other@x.mn', password: 'Passw0rd1' });
    const apps = await query('SELECT public_id FROM applications');
    const docs = await query('SELECT document_id FROM application_documents');
    let leaks = 0;
    let attempts = 0;
    for (const a of apps) {
      for (const url of [
        `/api/app/applications/${a.public_id}`,
        `/api/app/drafts/${a.public_id}`,
        `/api/app/applications/${a.public_id}/form-copy`,
      ]) {
        attempts += 1;
        if ((await o.get(url)).status === 200) leaks += 1;
      }
    }
    for (const d of docs) {
      attempts += 1;
      if ((await o.get(`/api/files/${d.document_id}`)).status === 200) leaks += 1;
    }
    assert.ok(attempts >= 20, `attempts=${attempts}`);
    assert.equal(leaks, 0);
  });

  test('админ эрх дангаараа файл, анкет үзэх эрх өгөхгүй', async () => {
    const admin = await login(DEMO.admin);
    const d = await one('SELECT document_id FROM application_documents LIMIT 1');
    assert.equal((await admin.get(`/api/files/${d.document_id}`)).status, 403);
    assert.equal((await admin.get('/api/operator/applications')).status, 403);
    assert.equal((await admin.get('/api/app/applications')).status, 403);
  });

  test('нэвтрээгүй хэрэглэгч 401', async () => {
    assert.equal((await client().get('/api/app/dashboard')).status, 401);
    assert.equal((await client().get('/api/files/1')).status, 401);
  });
});

describe('UC-07 Операторын бүрдлийн хяналт', () => {
  test('FR-10: зөвхөн хуваарилагдсан; өөр операторынх 403', async () => {
    const op2 = await login(DEMO.operator2);
    assert.equal((await op2.get('/api/operator/applications')).body.items.length, 0);
    assert.equal((await op2.get('/api/operator/applications/KR-20261105-DEMO02')).status, 403);
    const op = await login(DEMO.operator);
    const list = await op.get('/api/operator/applications');
    assert.equal(list.body.items.length, 2);
    const d = await op.get('/api/operator/applications/KR-20261105-DEMO02');
    assert.equal(d.body.application.form.passportNumber, '•••••567');
  });

  test('BR-09: дутуу үнэлгээнд тайлбар заавал, үнэлгээ шинэ мөрөөр, зэрэгцээ → 409', async () => {
    const op = await login(DEMO.operator);
    const ref = 'KR-20261105-DEMO02';
    assert.equal(
      (await op.post(`/api/operator/applications/${ref}/reviews`, { completeness: 'INCOMPLETE', comment: '', expectedReviewNo: 0 })).status,
      400,
    );
    assert.equal(
      (
        await op.post(`/api/operator/applications/${ref}/reviews`, {
          completeness: 'INCOMPLETE',
          comment: 'Зураг тод биш',
          expectedReviewNo: 0,
        })
      ).status,
      201,
    );
    assert.equal(
      (await op.post(`/api/operator/applications/${ref}/reviews`, { completeness: 'COMPLETE', expectedReviewNo: 0 })).status,
      409,
    );
    assert.equal(
      (await op.post(`/api/operator/applications/${ref}/reviews`, { completeness: 'COMPLETE', expectedReviewNo: 1 })).status,
      201,
    );
    const hist = await op.get(`/api/operator/applications/${ref}/reviews`);
    assert.deepEqual(
      hist.body.reviews.map((r) => r.reviewNo),
      [2, 1],
    );
    const a = await one('SELECT status FROM applications WHERE public_id = ?', [ref]);
    assert.equal(a.status, 'COMPLETE');
  });
});

describe('UC-08 Админ: лавлах, хэрэглэгч, хуваарилалт', () => {
  test('FR-11/BR-04: эх сурвалжгүй хувилбарыг нийтлэхгүй; нийтэлсэнийг засахгүй', async () => {
    const admin = await login(DEMO.admin);
    const t = await one("SELECT visa_type_id FROM visa_types WHERE code='C-3-9'");
    const nv = await admin.post(`/api/admin/visa-types/${t.visa_type_id}/versions`, { nameMn: 'Шинэ хувилбар' });
    assert.equal(nv.status, 201);
    assert.equal(nv.body.versionNo, 2);
    const pub = await admin.post(`/api/admin/versions/${nv.body.id}/publish`);
    assert.equal(pub.status, 400);
    assert.ok(pub.body.error.fields.sourceUrl && pub.body.error.fields.verifiedAt && pub.body.error.fields.requirements);
    assert.equal((await admin.put(`/api/admin/versions/${ids.versionId}`, { nameMn: 'Засвар' })).status, 409);
    assert.equal(
      (await admin.post(`/api/admin/versions/${ids.versionId}/requirements`, { code: 'X', title: 'XX', isRequired: true })).status,
      409,
    );
    const copy = await admin.post(`/api/admin/visa-types/${t.visa_type_id}/versions`, { copyFromVersionId: ids.versionId });
    assert.equal(copy.body.versionNo, 3);
    const v = await admin.get(`/api/admin/versions/${copy.body.id}`);
    assert.equal(v.body.requirements.length, 5);
    assert.equal(v.body.version.publishedAt, null);
    assert.equal(
      (
        await admin.put(`/api/admin/countries/1`, {
          isoCode: 'KR',
          nameMn: 'БНСУ',
          serviceStatus: 'ACTIVE',
          officialResultUrl: 'http://insecure',
        })
      ).status,
      400,
    );
  });

  test('шинэ хувилбар нийтлэгдэхэд өмнөх мэдүүлэг хуучин хувилбартайгаа үлдэнэ', async () => {
    const admin = await login(DEMO.admin);
    const v3 = await one('SELECT version_id FROM visa_info_versions WHERE version_no = 3');
    await admin.post(`/api/admin/versions/${v3.version_id}/publish`).expect(200);
    const pubList = await client().get('/api/visas?country=KR');
    assert.equal(pubList.body.visas[0].versionNo, 3);
    const old = await one("SELECT version_id FROM applications WHERE public_id='KR-20261020-DEMO01'");
    assert.equal(old.version_id, ids.versionId);
    const oldInfo = await client().get(`/api/visas/${ids.versionId}`);
    assert.equal(oldInfo.body.visa.canApply, false);
  });

  test('сүүлийн админыг идэвхгүй болгохгүй; хуваарилалттай операторыг хаахгүй', async () => {
    const admin = await login(DEMO.admin);
    assert.equal((await admin.put(`/api/admin/users/${ids.adminId}/status`, { isActive: false })).status, 409);
    assert.equal((await admin.put(`/api/admin/users/${ids.opId}/status`, { isActive: false })).status, 200 /* нээлттэй мэдүүлэггүй */);
    await admin.put(`/api/admin/users/${ids.opId}/status`, { isActive: true }).expect(200);
  });

  test('хуваарилалт: зэрэгцээ өөрчлөлт 409, идэвхгүй хэрэглэгч даруй гарна', async () => {
    const admin = await login(DEMO.admin);
    const ref = 'KR-20261109-DEMO03';
    const op2 = await one('SELECT user_id FROM users WHERE email = ?', [DEMO.operator2.email]);
    assert.equal((await admin.put(`/api/admin/assignments/${ref}`, { operatorId: op2.user_id, expectedOperatorId: null })).status, 200);
    assert.equal((await admin.put(`/api/admin/assignments/${ref}`, { operatorId: ids.opId, expectedOperatorId: null })).status, 409);
    const c2 = await login(DEMO.operator2);
    assert.equal((await c2.get(`/api/operator/applications/${ref}`)).status, 200);
    assert.equal((await admin.put(`/api/admin/users/${op2.user_id}/status`, { isActive: false })).status, 409);
    await admin.put(`/api/admin/assignments/${ref}`, { operatorId: ids.opId, expectedOperatorId: op2.user_id }).expect(200);
    await admin.put(`/api/admin/users/${op2.user_id}/status`, { isActive: false }).expect(200);
    assert.equal((await c2.get('/api/operator/applications')).status, 401);
  });

  test('үйлдлийн бүртгэлд нууц мэдээлэл байхгүй', async () => {
    const admin = await login(DEMO.admin);
    const r = await admin.get('/api/admin/audit');
    assert.ok(r.body.total > 10);
    const txt = JSON.stringify(r.body);
    assert.ok(!txt.includes('E7654321') && !txt.includes('Passw0rd1') && !txt.includes('storage'));
  });
});
