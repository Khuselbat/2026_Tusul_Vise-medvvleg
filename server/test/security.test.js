// Үе 3 — аюулгүй байдлын тест: IDOR матриц, CSRF, файл (polyglot, хуурамч өргөтгөл), rate-limit, HTTP толгой, cookie, JWT.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { pool, one, query } from '../src/db.js';
import { config } from '../src/config.js';
import { setup, login, client, newApplicant, submitApplication, assign, DEMO, PDF, PNG, uuid } from './helpers.js';

let app, ids, admin, op, op2, owner, stranger, ref, docId, evidenceId, importRef;

before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
  op = await login(app, DEMO.operator);
  op2 = await login(app, DEMO.operator2);
  owner = (await newApplicant(app, 'owner')).c;
  stranger = (await newApplicant(app, 'stranger')).c;
  ref = await submitApplication(owner, ids);
  await assign(admin, ref, ids.opId);
  docId = (await owner.get(`/api/app/applications/${ref}`)).body.application.documents[0].id;
  await owner.multipart(
    `/api/app/applications/${ref}/official-results`,
    { outcome: 'PENDING', checkedOn: new Date().toISOString().slice(0, 10), source: 'Korea Visa Portal', idempotencyKey: uuid() },
    [{ buf: PNG, name: 'portal.png' }],
  );
  evidenceId = (await owner.get(`/api/app/applications/${ref}`)).body.application.officialResults[0].evidence.id;
  importRef = (
    await owner.multipart(
      '/api/app/imports',
      { countryName: 'БНСУ', visaCategory: 'C-3-9', appliedOn: '2024-02-02', idempotencyKey: uuid() },
      [{ field: 'files', buf: PDF, name: 'old.pdf' }],
    )
  ).body.publicId;
});
after(async () => {
  await pool.end();
});

describe('IDOR — бусдын объект руу ID-гаар хандах', () => {
  test('мэдүүлэгч: бусдын мэдүүлэг, файл, нотолгоо, импорт, багц, үр дүн → 404 (оршин байгааг илчлэхгүй)', async () => {
    const reads = [
      `/api/app/applications/${ref}`,
      `/api/app/applications/${ref}/form-copy`,
      `/api/app/drafts/${ref}`,
      `/api/files/${docId}`,
      `/api/files/evidence/${evidenceId}`,
      `/api/app/imports/${importRef}`,
    ];
    for (const u of reads) assert.equal((await stranger.get(u)).status, 404, u);
    const writes = [
      ['post', `/api/app/applications/${ref}/supplements`],
      ['put', `/api/app/applications/${ref}/supplements/1`],
      ['post', `/api/app/applications/${ref}/supplements/1/submit`],
      ['del', `/api/app/imports/${importRef}`],
      ['post', `/api/app/drafts/${ref}/submit`],
      ['del', `/api/app/drafts/${ref}`],
    ];
    for (const [m, u] of writes) assert.equal((await stranger[m](u, {})).status, 404, `${m} ${u}`);
    const off = await stranger.multipart(`/api/app/applications/${ref}/official-results`, {
      outcome: 'APPROVED',
      checkedOn: '2026-01-01',
      source: 'x x',
      idempotencyKey: uuid(),
    });
    assert.equal(off.status, 404);
  });

  test('хуваарилаагүй оператор → 403; админ хувийн агуулга → 403; импорт ажилтанд хэзээ ч харагдахгүй', async () => {
    for (const u of [
      `/api/operator/applications/${ref}`,
      `/api/operator/applications/${ref}/reviews`,
      `/api/files/${docId}`,
      `/api/files/evidence/${evidenceId}`,
    ]) {
      assert.equal((await op2.get(u)).status, 403, u);
    }
    for (const u of [
      `/api/files/${docId}`,
      `/api/files/evidence/${evidenceId}`,
      `/api/app/applications/${ref}`,
      `/api/operator/applications/${ref}`,
    ]) {
      assert.equal((await admin.get(u)).status, 403, u);
    }
    const impFile = (await one('SELECT file_id FROM evidence_files WHERE kind = ?', ['IMPORT'])).file_id;
    for (const c of [op, op2, admin]) assert.equal((await c.get(`/api/files/evidence/${impFile}`)).status, 403);
  });

  test('дараалсан ID-гаар файл таахад задрал 0 (1..max+5)', async () => {
    const max = Number((await one('SELECT MAX(document_id) AS m FROM application_documents')).m);
    const own = new Set(
      (
        await query(
          'SELECT d.document_id FROM application_documents d JOIN applications a ON a.application_id = d.application_id JOIN users u ON u.user_id = a.applicant_id WHERE u.email LIKE ?',
          ['t.stranger@%'],
        )
      ).map((x) => x.document_id),
    );
    let leaks = 0;
    for (let i = 1; i <= max + 5; i += 1) if (!own.has(i) && (await stranger.get(`/api/files/${i}`)).status === 200) leaks += 1;
    assert.equal(leaks, 0);
  });
});

describe('CSRF (дүрэм 8)', () => {
  test('X-Requested-With-гүй өөрчлөх хүсэлт бүх /api замд 403 — байхгүй зам, нэвтрээгүй ч', async () => {
    for (const [m, u] of [
      ['post', '/api/auth/login'],
      ['post', '/api/app/privacy/export'],
      ['put', '/api/admin/users/1/status'],
      ['delete', '/api/auth/sessions/x'],
      ['post', '/api/no-such-route'],
    ]) {
      const r = await request(app)[m](u).send({});
      assert.equal(r.status, 403, u);
      assert.equal(r.body.error.code, 'CSRF');
    }
  });

  test('form/text төрлийн хүсэлтийг (HTML form-оор CSRF) 415-аар хаана', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .set('Content-Type', 'text/plain')
      .send('email=a&password=b');
    assert.equal(r.status, 415);
    const f = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('email=a&password=b');
    assert.equal(f.status, 415);
  });
});

describe('Файл хүлээн авах — хуурамч төрөл, polyglot', () => {
  let draft;
  before(async () => {
    draft = (await owner.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
  });
  const up = (buf, name) => owner.multipart(`/api/app/drafts/${draft}/documents`, { requirementId: ids.reqIds.FINANCIAL }, [{ buf, name }]);

  test('HTML/SVG/EXE-г PDF/PNG нэрээр, давхар өргөтгөл, хоосон файл → 400', async () => {
    const cases = [
      [Buffer.from('<!doctype html><script>alert(1)</script>'), 'x.pdf'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'x.png'],
      [Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'), 'x.pdf'],
      [PDF, 'x.pdf.html'],
      [PDF, 'x.jpg'],
      [PNG, 'x.svg'],
      [Buffer.alloc(0), 'x.pdf'],
    ];
    for (const [buf, name] of cases) assert.equal((await up(buf, name)).status, 400, name);
  });

  test('PNG толгой + HTML/JS (polyglot) хүлээж авсан ч image/png, nosniff, CSP default-src none-ээр үйлчилнэ', async () => {
    const poly = Buffer.concat([PNG, Buffer.from('<html><script>alert(document.cookie)</script></html>')]);
    const r = await up(poly, 'poly.png');
    assert.equal(r.status, 201);
    const f = await owner.get(`/api/files/${r.body.document.id}`);
    assert.equal(f.headers['content-type'], 'image/png');
    assert.equal(f.headers['x-content-type-options'], 'nosniff');
    assert.match(f.headers['content-security-policy'], /default-src 'none'/);
    assert.match(f.headers['content-disposition'], /^inline; filename\*=UTF-8''/);
  });

  test('замын тэмдэгт, хяналтын тэмдэгттэй нэр цэвэрлэгдэнэ; Content-Disposition-д шууд орохгүй', async () => {
    const r = await up(PDF, '..\\..\\evil"\r\nX-Injected: 1.pdf');
    assert.equal(r.status, 201);
    assert.ok(!/[\\/\r\n"]/.test(r.body.document.originalName), r.body.document.originalName);
    const f = await owner.get(`/api/files/${r.body.document.id}?download=1`);
    assert.equal(f.headers['x-injected'], undefined);
    assert.match(f.headers['content-disposition'], /^attachment; filename\*=UTF-8''[^"\r\n]+$/);
  });
});

describe('Rate limit', () => {
  test('нэвтрэх: 10 буруу оролдлогын дараа 429; нууц үг сэргээх: 5-ын дараа 429', async () => {
    process.env.TEST_REAL_RATE_LIMITS = '1';
    try {
      const email = 'ratelimit.target@example.com';
      const codes = [];
      for (let i = 0; i < 11; i += 1) codes.push((await client(app).post('/api/auth/login', { email, password: `Wrong${i}x1` })).status);
      assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
      assert.equal(codes[10], 429);
      const f = [];
      for (let i = 0; i < 6; i += 1)
        f.push((await client(app).post('/api/auth/password/forgot', { email: 'rl.forgot@example.com' })).status);
      assert.equal(f[5], 429);
    } finally {
      delete process.env.TEST_REAL_RATE_LIMITS;
    }
  });
});

describe('HTTP толгой, cookie, JWT', () => {
  test('аюулгүй байдлын толгойнууд; X-Powered-By байхгүй; API кэшлэхгүй', async () => {
    const r = await request(app).get('/api/visas');
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'self'/);
    assert.match(r.headers['content-security-policy'], /object-src/);
    assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });

  test('сессийн cookie: HttpOnly, SameSite=Strict; 2FA cookie зөвхөн /api/auth/mfa замд', async () => {
    const a = await client(app).post('/api/auth/login', { email: DEMO.applicant.email, password: DEMO.applicant.password });
    const sid = a.headers['set-cookie'].find((c) => c.startsWith('civiz_sid='));
    assert.match(sid, /HttpOnly/);
    assert.match(sid, /SameSite=Strict/);
    assert.match(sid, /Path=\//);
    const s = await client(app).post('/api/auth/login', { email: DEMO.admin.email, password: DEMO.admin.password });
    const mfa = s.headers['set-cookie'].find((c) => c.startsWith('civiz_mfa='));
    assert.match(mfa, /Path=\/api\/auth\/mfa/);
    assert.match(mfa, /HttpOnly/);
  });

  test('хуурамч/alg=none/өөр түлхүүрээр гарын үсэгтэй JWT → нэвтрээгүй', async () => {
    const u = await one('SELECT public_id FROM users WHERE email = ?', [DEMO.admin.email]);
    const sid = (await one('SELECT session_id FROM user_sessions WHERE revoked_at IS NULL LIMIT 1')).session_id;
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: u.public_id, sid })).toString('base64url')}.`;
    const forged = jwt.sign({ sub: u.public_id, sid }, 'attacker-secret', { algorithm: 'HS256' });
    for (const t of [none, forged, 'garbage']) {
      const r = await request(app).get('/api/admin/users').set('Cookie', `civiz_sid=${t}`);
      assert.equal(r.status, 401, t.slice(0, 20));
    }
    assert.ok(config.jwtSecret.length >= 32);
  });

  test('хэт том JSON 413; эвдэрсэн JSON 400; SQL тэмдэгт бүхий хайлт аюулгүй', async () => {
    const big = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.mn', password: 'x'.repeat(300 * 1024) }));
    assert.equal(big.status, 413);
    const bad = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    assert.equal(bad.status, 400);
    const sqli = await owner.get(`/api/app/applications?q=${encodeURIComponent("' OR 1=1 -- ")}`);
    assert.equal(sqli.status, 200);
    assert.equal(sqli.body.total, 0);
    const v = await request(app).get(`/api/visas?q=${encodeURIComponent("%' UNION SELECT password_hash FROM users -- ")}`);
    assert.equal(v.status, 200);
    assert.equal(v.body.visas.length, 0);
  });

  test('нэвтрэх бүрд шинэ сесс (session fixation-аас хамгаална)', async () => {
    const a = await client(app).post('/api/auth/login', { email: DEMO.applicant.email, password: DEMO.applicant.password });
    const b = await client(app).post('/api/auth/login', { email: DEMO.applicant.email, password: DEMO.applicant.password });
    const sidOf = (r) =>
      jwt.decode(
        r.headers['set-cookie']
          .find((c) => c.startsWith('civiz_sid='))
          .split(';')[0]
          .slice(10),
      ).sid;
    assert.notEqual(sidOf(a), sidOf(b));
  });
});
