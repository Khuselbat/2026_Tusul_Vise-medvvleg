// Үе 1.5 — Юзкейсийн хувилбарт (A) ба алдааны (E) урсгалууд (тайлан бүлэг 23–30), өмнө нь тестгүй байсныг нөхөв.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { pool, one, query } from '../src/db.js';
import { config } from '../src/config.js';
import { setup, login, client, newApplicant, submitApplication, assign, review, validForm, DEMO, PDF, uuid } from './helpers.js';

let app, ids, admin, op;

before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
  op = await login(app, DEMO.operator);
});
after(async () => {
  await pool.end();
});

describe('UC-01 Бүртгүүлэх', () => {
  test('A1: имэйлийн хэлбэр буруу, дутуу талбар → талбар бүрийн алдаа, бүртгэл үүсэхгүй', async () => {
    const c = client(app);
    const r = await c.post('/api/auth/register', { displayName: '', email: 'not-an-email', password: 'short', passwordConfirm: 'x' });
    assert.equal(r.status, 400);
    for (const f of ['displayName', 'email', 'password']) assert.ok(r.body.error.fields[f], f);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM users WHERE email = 'not-an-email'")).n), 0);
  });
});

describe('UC-02 Нэвтрэх', () => {
  test('E1: идэвхгүй хэрэглэгч ба буруу нууц үг — ижил ерөнхий алдаа (бүртгэл байгаа эсэхийг илчлэхгүй)', async () => {
    const { user } = await newApplicant(app, 'inactive');
    const u = await one('SELECT user_id FROM users WHERE email = ?', [user.email]);
    assert.equal((await admin.put(`/api/admin/users/${u.user_id}/status`, { isActive: false })).status, 200);
    const c = client(app);
    const inactive = await c.post('/api/auth/login', { email: user.email, password: user.password });
    const wrong = await c.post('/api/auth/login', { email: DEMO.applicant.email, password: 'Wrong12345' });
    const unknown = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'Wrong12345' });
    for (const r of [inactive, wrong, unknown]) {
      assert.equal(r.status, 401);
      assert.equal(r.body.error.message, wrong.body.error.message);
      assert.equal(r.headers['set-cookie'], undefined, 'сесс үүсгэхгүй');
    }
  });

  test('A1: дутуу талбар → 400, сесс үүсэхгүй', async () => {
    const r = await client(app).post('/api/auth/login', { email: '', password: '' });
    assert.equal(r.status, 400);
    assert.equal(r.headers['set-cookie'], undefined);
  });
});

describe('UC-04 Мэдүүлэг илгээх', () => {
  test('E3: сесс дууссан үед илгээлт зогсож (401), ноорог хэвээр DRAFT', async () => {
    const { c } = await newApplicant(app, 'expired');
    const d = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const me = await c.get('/api/auth/me');
    const expired = jwt.sign({ sub: me.body.user.publicId, exp: Math.floor(Date.now() / 1000) - 60 }, config.jwtSecret, {
      algorithm: 'HS256',
    });
    const r = await request(app).post(`/api/app/drafts/${d}/submit`).set('X-Requested-With', 'civiz').set('Cookie', `civiz_sid=${expired}`);
    assert.equal(r.status, 401);
    assert.match(r.body.error.message, /дахин нэвтэрнэ/i);
    assert.equal((await one('SELECT status FROM applications WHERE public_id = ?', [d])).status, 'DRAFT');
  });

  test('A2: илгээхээс өмнө анкетыг засаж, дахин шалгана (хүчингүй болсон огноо → 422 form)', async () => {
    const { c } = await newApplicant(app, 'edit');
    const ref = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    assert.equal((await c.put(`/api/app/drafts/${ref}/form`, validForm())).status, 200);
    // Анкетыг засах: шинэ утгаар дахин хадгална
    assert.equal((await c.put(`/api/app/drafts/${ref}/form`, { ...validForm(), givenName: 'Tsetseg' })).status, 200);
    assert.equal((await c.get(`/api/app/drafts/${ref}`)).body.draft.form.givenName, 'TSETSEG');
    const s = await c.post(`/api/app/drafts/${ref}/submit`);
    assert.equal(s.status, 422);
    assert.ok(s.body.error.missing.some((m) => m.step === 'documents'));
  });

  test('A3: цуцлахад ноорог болон түр файл дискнээс бүрэн устна', async () => {
    const { c } = await newApplicant(app, 'cancel');
    const ref = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const up = await c.multipart(`/api/app/drafts/${ref}/documents`, { requirementId: ids.reqIds.PASSPORT_COPY }, [
      { buf: PDF, name: 'p.pdf' },
    ]);
    const key = (await one('SELECT storage_key FROM application_documents WHERE document_id = ?', [up.body.document.id])).storage_key;
    assert.equal((await c.del(`/api/app/drafts/${ref}`)).status, 200);
    assert.equal(await one('SELECT 1 AS x FROM applications WHERE public_id = ?', [ref]), null);
    await assert.rejects(fs.access(path.join(config.storageDir, key.slice(0, 2), key)));
  });

  test('E1: идэвхгүй визийн төрөлд шууд хүсэлтээр ноорог үүсгэхгүй', async () => {
    const { c } = await newApplicant(app, 'inactivetype');
    const d2 = await one(
      "SELECT v.version_id FROM visa_info_versions v JOIN visa_types t ON t.visa_type_id = v.visa_type_id WHERE t.code = 'D-2'",
    );
    const r = await c.post('/api/app/drafts', { versionId: d2.version_id, idempotencyKey: uuid() });
    assert.ok([403, 404].includes(r.status), String(r.status));
  });
});

describe('UC-05 Архив үзэх', () => {
  test('A1: мэдүүлэггүй хэрэглэгчид хоосон архив (алдаа биш)', async () => {
    const { c } = await newApplicant(app, 'empty');
    const r = await c.get('/api/app/applications');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
    assert.deepEqual(r.body.items, []);
  });

  test('E2: файл хадгалалтаас олдохгүй бол 404 мессеж, дэлгэрэнгүй хэвээр нээгдэнэ', async () => {
    const { c } = await newApplicant(app, 'lostfile');
    const ref = await submitApplication(c, ids);
    const doc = (await c.get(`/api/app/applications/${ref}`)).body.application.documents[0];
    const key = (await one('SELECT storage_key FROM application_documents WHERE document_id = ?', [doc.id])).storage_key;
    await fs.rm(path.join(config.storageDir, key.slice(0, 2), key));
    const f = await c.get(`/api/files/${doc.id}`);
    assert.equal(f.status, 404);
    assert.match(f.body.error.message, /хадгалалтаас олдсонгүй/);
    assert.equal((await c.get(`/api/app/applications/${ref}`)).status, 200);
  });
});

describe('UC-07 Бүрдэл хянах', () => {
  test('хуваарилалт өөрчлөгдсөн (дэлгэц нээлттэй байх хооронд) → үнэлгээ хадгалахгүй (409), өөр операторынх 403', async () => {
    const { c } = await newApplicant(app, 'reassign');
    const ref = await submitApplication(c, ids);
    await assign(admin, ref, ids.opId);
    const before = await op.get(`/api/operator/applications/${ref}`);
    assert.equal(before.status, 200);
    await assign(admin, ref, ids.op2Id, ids.opId);
    const r = await op.post(`/api/operator/applications/${ref}/reviews`, { completeness: 'COMPLETE', expectedReviewNo: 0 });
    assert.equal(r.status, 409);
    assert.equal((await op.get(`/api/operator/applications/${ref}`)).status, 403);
    assert.equal(
      Number(
        (
          await one(
            'SELECT COUNT(*) AS n FROM reviews r JOIN applications a ON a.application_id = r.application_id WHERE a.public_id = ?',
            [ref],
          )
        ).n,
      ),
      0,
    );
  });

  test('A1: “Дутуу” тайлбаргүй бол хадгалахгүй; E3-тай адил өмнөх төлөв хэвээр', async () => {
    const { c } = await newApplicant(app, 'nocomment');
    const ref = await submitApplication(c, ids);
    await assign(admin, ref, ids.opId);
    const r = await op.post(`/api/operator/applications/${ref}/reviews`, {
      completeness: 'INCOMPLETE',
      comment: '  ',
      expectedReviewNo: 0,
    });
    assert.equal(r.status, 400);
    assert.equal((await one('SELECT status FROM applications WHERE public_id = ?', [ref])).status, 'IN_REVIEW');
  });

  test('BR-09: үнэлгээний API визийн шийдвэрийн утга хүлээж авахгүй', async () => {
    const { c } = await newApplicant(app, 'decision');
    const ref = await submitApplication(c, ids);
    await assign(admin, ref, ids.opId);
    for (const v of ['APPROVED', 'REFUSED', 'VISA_GRANTED']) {
      const r = await op.post(`/api/operator/applications/${ref}/reviews`, { completeness: v, expectedReviewNo: 0 });
      assert.equal(r.status, 400, v);
    }
    await review(op, ref, 'COMPLETE');
  });
});

describe('UC-08 Лавлах шинэчлэх', () => {
  test('E1: админ биш хэрэглэгч лавлах өөрчлөхгүй (403), зочин 401', async () => {
    const appl = await login(app, DEMO.applicant);
    for (const c of [op, appl]) {
      assert.equal((await c.post('/api/admin/countries', { isoCode: 'JP', nameMn: 'Япон', serviceStatus: 'COMING_SOON' })).status, 403);
      assert.equal((await c.post(`/api/admin/versions/${ids.versionId}/publish`)).status, 403);
    }
    assert.equal((await client(app).get('/api/admin/visa-types')).status, 401);
  });

  test('A2: эх сурвалж/огноо дутуу хувилбарыг нийтлэхгүй; өмнөх нийтлэгдсэн мэдээлэл хэвээр', async () => {
    const before = (await client(app).get('/api/visas')).body.visas.map((v) => v.versionId);
    const t = await one("SELECT visa_type_id FROM visa_types WHERE code = 'C-3-9'");
    const v = await admin.post(`/api/admin/visa-types/${t.visa_type_id}/versions`, { nameMn: 'Шинэ хувилбар', description: 'туршилт' });
    assert.ok([200, 201].includes(v.status), JSON.stringify(v.body));
    const vid = v.body.versionId ?? v.body.id ?? v.body.version?.id;
    const p = await admin.post(`/api/admin/versions/${vid}/publish`);
    assert.equal(p.status, 400);
    const after = (await client(app).get('/api/visas')).body.visas.map((x) => x.versionId);
    assert.deepEqual(after, before);
  });
});

describe('CSRF (дүрэм 8) — шинэ endpoint-ууд', () => {
  test('X-Requested-With толгойгүй өөрчлөх хүсэлтийг хаана', async () => {
    const appl = await login(app, DEMO.applicant);
    const ref = (await query("SELECT public_id FROM applications WHERE status = 'COMPLETE' LIMIT 1"))[0].public_id;
    for (const [m, u] of [
      ['post', `/api/app/applications/${ref}/supplements`],
      ['post', `/api/app/applications/${ref}/official-results`],
      ['post', '/api/app/imports'],
      ['post', `/api/operator/applications/${ref}/handover`],
    ]) {
      const r = await appl.agent[m](u).send({});
      assert.equal(r.status, 403, u);
      assert.equal(r.body.error.code, 'CSRF', u);
    }
  });
});
