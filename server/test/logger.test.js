// Бүтэцтэй лог: request id, нууц мэдээлэл (нууц үг, cookie, query, SQL утга) логт гарахгүй.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, one } from '../src/db.js';
import { createLogger, safeError } from '../src/lib/logger.js';
import { resetDatabase } from '../src/lib/migrations.js';
import { seed, DEMO } from '../scripts/seed.js';

let lines = [];
let app;
const sink = new Writable({
  write(chunk, _enc, cb) {
    lines.push(chunk.toString());
    cb();
  },
});
const logged = () => lines.join('');

before(async () => {
  await resetDatabase();
  await seed({ withDemoApplications: true, rounds: 4 });
  app = createApp({ logger: createLogger({ destination: sink, level: 'info' }) });
});
after(async () => {
  await pool.end();
});

describe('Бүтэцтэй лог', () => {
  test('хүсэлт бүр request id-тай; audit-ын request_id-тай таарна', async () => {
    lines = [];
    const r = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .send({ email: DEMO.applicant.email, password: DEMO.applicant.password });
    assert.equal(r.status, 200);
    const id = r.headers['x-request-id'];
    assert.match(id, /^[0-9a-f-]{36}$/);
    const entry = lines.map((l) => JSON.parse(l)).find((e) => e.req?.id === id);
    assert.ok(entry, 'хүсэлтийн лог мөр олдсонгүй');
    assert.equal(entry.res.statusCode, 200);
    const ev = await one("SELECT request_id FROM audit_events WHERE action = 'LOGIN' ORDER BY event_id DESC LIMIT 1");
    assert.equal(ev.request_id, id);
  });

  test('нууц үг, cookie, query string логт гарахгүй', async () => {
    lines = [];
    const secret = 'Sup3rSecretPw!';
    await request(app).post('/api/auth/login').set('X-Requested-With', 'civiz').send({ email: 'nobody@example.com', password: secret });
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .send({ email: DEMO.applicant.email, password: DEMO.applicant.password });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    await request(app).get('/api/app/applications?q=KR-20261020-DEMO01').set('Cookie', cookie);
    const out = logged();
    assert.ok(!out.includes(secret), 'нууц үг логт гарсан');
    assert.ok(!out.includes(DEMO.applicant.password), 'нууц үг логт гарсан');
    assert.ok(!out.includes(cookie.split('=')[1]), 'сессийн токен логт гарсан');
    assert.ok(!out.includes('DEMO01'), 'query string логт гарсан');
    assert.ok(out.includes('/api/app/applications'), 'замыг логлох ёстой');
  });

  test('SQL алдаанаас утга (мессеж, sql) хасагдана', () => {
    const e = Object.assign(new Error("Duplicate entry 'saran@example.com' for key 'uq_users_email'"), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
      sqlMessage: "Duplicate entry 'saran@example.com'",
      sql: "INSERT INTO users ... 'saran@example.com'",
    });
    const s = JSON.stringify(safeError(e));
    assert.ok(!s.includes('saran@example.com'));
    assert.match(s, /ER_DUP_ENTRY/);
    assert.match(JSON.stringify(safeError(new Error('plain failure'))), /plain failure/);
  });
});
