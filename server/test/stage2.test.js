// Үе 2: имэйл баталгаажуулалт, нууц үг сэргээх, сесс удирдлага, ажилтны 2FA (TOTP), мэдэгдэл + outbox.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool, query, one } from '../src/db.js';
import { base32Encode, codeAt, verifyCode, currentStep } from '../src/lib/totp.js';
import { dispatchPending } from '../src/lib/notify.js';
import {
  setup,
  client,
  login,
  newApplicant,
  submitApplication,
  assign,
  review,
  lastMailToken,
  outbox,
  mfaSecrets,
  nextCode,
  DEMO,
  PDF,
} from './helpers.js';

let app, ids;
before(async () => {
  ({ app, ids } = await setup());
});
after(async () => {
  await pool.end();
});

const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('civiz_sid='))?.split(';')[0];
const me = async (c) => (await c.get('/api/auth/me')).body.user;

describe('TOTP (RFC 6238)', () => {
  test('албан ёсны тест вектор ба давтан ашиглалтын хамгаалалт', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(codeAt(secret, Math.floor(59 / 30)), '287082');
    assert.equal(codeAt(secret, Math.floor(1111111109 / 30)), '081804');
    const now = Date.now();
    const step = currentStep(now);
    const code = codeAt(secret, step);
    assert.equal(verifyCode(secret, code, { now }), step);
    assert.equal(verifyCode(secret, code, { now, afterStep: step }), null, 'ижил алхмыг дахин зөвшөөрөхгүй');
    assert.equal(verifyCode(secret, codeAt(secret, step - 3), { now }), null, 'хуучин код');
    assert.equal(verifyCode(secret, 'abc123', { now }), null);
  });
});

describe('Имэйл баталгаажуулалт', () => {
  const u = { email: 'verify.me@example.com', password: 'Verify1234', name: 'Баталгаа' };
  let c;

  test('бүртгэлд холбоос илгээнэ; захидалд нууц үг байхгүй; санд зөвхөн хэш', async () => {
    c = client(app);
    const r = await c.post('/api/auth/register', {
      displayName: u.name,
      email: u.email,
      password: u.password,
      passwordConfirm: u.password,
    });
    assert.equal(r.status, 201);
    const mail = outbox.findLast((m) => m.to === u.email);
    assert.match(mail.text, /\/verify-email\?token=/);
    assert.ok(!mail.text.includes(u.password));
    const raw = lastMailToken(u.email, '/verify-email');
    assert.equal(await one('SELECT 1 AS x FROM user_tokens WHERE token_hash = ?', [raw]), null, 'түүхий токен санд хадгалагдахгүй');
  });

  test('баталгаажаагүй бол мэдүүлэг илгээхгүй (403 EMAIL_NOT_VERIFIED)', async () => {
    c = await login(app, u);
    assert.equal((await me(c)).emailVerified, false);
    const d = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: crypto.randomUUID() });
    const s = await c.post(`/api/app/drafts/${d.body.publicId}/submit`);
    assert.equal(s.status, 403);
    assert.equal(s.body.error.code, 'EMAIL_NOT_VERIFIED');
  });

  test('дахин илгээхэд хуучин токен хүчингүй; буруу/хуучин токен 400; зөв нь нэг удаа', async () => {
    const old = lastMailToken(u.email, '/verify-email');
    // 60 секундын хүлээлтийг алгасна (email.test.js-д тусад нь шалгана)
    await query(
      "UPDATE user_tokens t JOIN users x ON x.user_id = t.user_id SET t.created_at = t.created_at - INTERVAL 2 MINUTE WHERE x.email = ? AND t.purpose = 'VERIFY_EMAIL'",
      [u.email],
    );
    assert.equal((await c.post('/api/auth/verify-email/resend')).status, 200);
    const fresh = lastMailToken(u.email, '/verify-email');
    assert.notEqual(old, fresh);
    assert.equal((await c.post('/api/auth/verify-email', { token: old })).status, 400);
    assert.equal((await c.post('/api/auth/verify-email', { token: 'x'.repeat(43) })).status, 400);
    assert.equal((await c.post('/api/auth/verify-email', { token: fresh })).status, 200);
    assert.equal((await c.post('/api/auth/verify-email', { token: fresh })).status, 400);
    assert.equal((await me(c)).emailVerified, true);
  });

  test('хугацаа дууссан токен 400', async () => {
    const { user } = await newApplicant(app, 'exp');
    const c2 = client(app);
    await c2.post('/api/auth/password/forgot', { email: user.email });
    const raw = lastMailToken(user.email, '/reset-password');
    await query("UPDATE user_tokens SET expires_at = NOW(6) - INTERVAL 1 MINUTE WHERE purpose = 'RESET_PASSWORD'");
    assert.equal(
      (await c2.post('/api/auth/password/reset', { token: raw, newPassword: 'Newpass1234', newPasswordConfirm: 'Newpass1234' })).status,
      400,
    );
  });
});

describe('Нууц үг сэргээх', () => {
  test('бүртгэлгүй/бүртгэлтэй имэйлд ижил хариу; зөвхөн бүртгэлтэйд захидал', async () => {
    const before = outbox.length;
    const a = await client(app).post('/api/auth/password/forgot', { email: 'nobody.here@example.com' });
    const b = await client(app).post('/api/auth/password/forgot', { email: DEMO.applicant.email });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(outbox.length, before + 1);
    assert.equal(outbox.at(-1).to, DEMO.applicant.email);
  });

  test('сэргээхэд бүх сесс хүчингүй; хуучин нууц үг ажиллахгүй; токен нэг удаа', async () => {
    const { c, user } = await newApplicant(app, 'reset');
    await client(app).post('/api/auth/password/forgot', { email: user.email });
    const token = lastMailToken(user.email, '/reset-password');
    const weak = await client(app).post('/api/auth/password/reset', { token, newPassword: 'short', newPasswordConfirm: 'short' });
    assert.equal(weak.status, 400);
    const ok = await client(app).post('/api/auth/password/reset', {
      token,
      newPassword: 'Brandnew1234',
      newPasswordConfirm: 'Brandnew1234',
    });
    assert.equal(ok.status, 200);
    const old = await c.get('/api/app/dashboard');
    assert.equal(old.status, 401);
    assert.equal(old.body.error.code, 'SESSION_EXPIRED');
    assert.equal((await client(app).post('/api/auth/login', { email: user.email, password: user.password })).status, 401);
    assert.equal((await client(app).post('/api/auth/login', { email: user.email, password: 'Brandnew1234' })).status, 200);
    const again = await client(app).post('/api/auth/password/reset', {
      token,
      newPassword: 'Another1234',
      newPasswordConfirm: 'Another1234',
    });
    assert.equal(again.status, 400);
  });
});

describe('Сесс удирдлага', () => {
  test('гарахад токен серверт хүчингүй (хуулсан cookie ажиллахгүй)', async () => {
    const c = client(app);
    const r = await c.post('/api/auth/login', { email: DEMO.applicant.email, password: DEMO.applicant.password });
    const ck = cookieOf(r);
    assert.equal((await request(app).get('/api/app/dashboard').set('Cookie', ck)).status, 200);
    await c.post('/api/auth/logout');
    assert.equal((await request(app).get('/api/app/dashboard').set('Cookie', ck)).status, 401);
  });

  test('сессийн жагсаалт; нууц үг солиход бусад сесс хүчингүй, одоогийнх үлдэнэ', async () => {
    const { c: a1, user } = await newApplicant(app, 'sess');
    const a2 = await login(app, user);
    const list = (await a1.get('/api/auth/sessions')).body.items;
    assert.equal(list.length, 2);
    assert.equal(list.filter((s) => s.current).length, 1);
    const pw = await a1.put('/api/auth/me/password', {
      currentPassword: user.password,
      newPassword: 'Changed1234',
      newPasswordConfirm: 'Changed1234',
    });
    assert.equal(pw.status, 200);
    assert.equal(pw.body.otherSessionsRevoked, 1);
    assert.equal((await a1.get('/api/app/dashboard')).status, 200);
    assert.equal((await a2.get('/api/app/dashboard')).status, 401);
  });

  test('бүх төхөөрөмжөөс гарах; бусдын сессийг хүчингүй болгохгүй (404)', async () => {
    const { c: a1, user } = await newApplicant(app, 'all');
    const a2 = await login(app, user);
    const other = await login(app, DEMO.applicant);
    const otherSid = (await other.get('/api/auth/sessions')).body.items[0].id;
    assert.equal((await a1.del(`/api/auth/sessions/${otherSid}`)).status, 404);
    assert.equal((await a1.post('/api/auth/sessions/revoke-all')).status, 200);
    assert.equal((await a1.get('/api/app/dashboard')).status, 401);
    assert.equal((await a2.get('/api/app/dashboard')).status, 401);
    assert.equal((await other.get('/api/app/dashboard')).status, 200);
  });

  test('идэвхгүй болгоход тухайн хэрэглэгчийн сесс хүчингүй', async () => {
    const admin = await login(app, DEMO.admin);
    const { c, user } = await newApplicant(app, 'deact');
    const id = (await one('SELECT user_id FROM users WHERE email = ?', [user.email])).user_id;
    await admin.put(`/api/admin/users/${id}/status`, { isActive: false });
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL', [id])).n), 0);
    assert.equal((await c.get('/api/app/dashboard')).status, 401);
  });
});

describe('Ажилтны 2FA (TOTP)', () => {
  const op = { email: DEMO.operator2.email, password: DEMO.operator2.password };

  test('нууц үг зөв ч 2FA-гүйгээр сесс үүсэхгүй; мэдүүлэгчид 2FA шаардахгүй', async () => {
    const c = client(app);
    const r = await c.post('/api/auth/login', op);
    assert.equal(r.status, 200);
    assert.equal(r.body.mfa, 'ENROLL');
    assert.equal(cookieOf(r), undefined);
    assert.equal(await me(c), null);
    assert.equal((await client(app).post('/api/auth/mfa/setup')).status, 401, 'cookie-гүй бол хориглоно');
    const a = await client(app).post('/api/auth/login', { email: DEMO.applicant.email, password: DEMO.applicant.password });
    assert.ok(a.body.user && !a.body.mfa);
  });

  test('бүртгэл: QR + нууц, 10 нөөц код; нууц санд шифрлэгдсэн', async () => {
    const c = await login(app, op);
    assert.equal(c.recoveryCodes.length, 10);
    assert.equal((await me(c)).mfaEnabled, true);
    const row = await one('SELECT mfa_secret_enc FROM users WHERE email = ?', [op.email]);
    assert.ok(!Buffer.from(row.mfa_secret_enc).toString('latin1').includes(mfaSecrets.get(op.email)));
    const h = await one('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = (SELECT user_id FROM users WHERE email = ?) LIMIT 1', [
      op.email,
    ]);
    assert.ok(!c.recoveryCodes.some((x) => x.replace('-', '') === h.code_hash));
    op.recovery = c.recoveryCodes;
  });

  test('ижил кодыг дахин ашиглахгүй (replay); 5 буруу оролдлогын дараа дахин нэвтэрнэ', async () => {
    const c = client(app);
    await c.post('/api/auth/login', op);
    const code = await nextCode(op.email);
    assert.equal((await c.post('/api/auth/mfa/verify', { code })).status, 200);
    const c2 = client(app);
    await c2.post('/api/auth/login', op);
    const replay = await c2.post('/api/auth/mfa/verify', { code });
    assert.equal(replay.status, 400);
    for (let i = 0; i < 4; i += 1) assert.equal((await c2.post('/api/auth/mfa/verify', { code: '000000' })).status, 400);
    const locked = await c2.post('/api/auth/mfa/verify', { code: await nextCode(op.email) });
    assert.equal(locked.status, 401);
    assert.equal(locked.body.error.code, 'MFA_EXPIRED');
  });

  test('нөөц код нэг удаа ажиллана', async () => {
    const c = client(app);
    await c.post('/api/auth/login', op);
    const r = await c.post('/api/auth/mfa/verify', { recoveryCode: op.recovery[0].toLowerCase() });
    assert.equal(r.status, 200);
    assert.equal(r.body.recoveryCodesLeft, 9);
    const c2 = client(app);
    await c2.post('/api/auth/login', op);
    assert.equal((await c2.post('/api/auth/mfa/verify', { recoveryCode: op.recovery[0] })).status, 400);
    const actions = (await query("SELECT action FROM audit_events WHERE action LIKE 'MFA%'")).map((x) => x.action);
    assert.ok(actions.includes('MFA_ENABLE') && actions.includes('MFA_RECOVERY_USED'));
  });

  test('админ 2FA-г дахин тохируулна → сесс хүчингүй, дахин QR; өөрийгөө/мэдүүлэгчийг 400', async () => {
    const admin = await login(app, DEMO.admin);
    const opc = await login(app, op);
    const id = (await one('SELECT user_id FROM users WHERE email = ?', [op.email])).user_id;
    assert.equal((await admin.post(`/api/admin/users/${ids.adminId}/mfa-reset`)).status, 400);
    assert.equal((await admin.post(`/api/admin/users/${ids.applicantId}/mfa-reset`)).status, 400);
    assert.equal((await opc.post(`/api/admin/users/${id}/mfa-reset`)).status, 403);
    assert.equal((await admin.post(`/api/admin/users/${id}/mfa-reset`)).status, 200);
    assert.equal((await opc.get('/api/operator/applications')).status, 401);
    const r = await client(app).post('/api/auth/login', op);
    assert.equal(r.body.mfa, 'ENROLL');
  });
});

describe('Мэдэгдэл ба имэйл outbox', () => {
  let a, admin, opc, ref;
  before(async () => {
    ({ c: a } = await newApplicant(app, 'notif'));
    admin = await login(app, DEMO.admin);
    opc = await login(app, DEMO.operator);
    ref = await submitApplication(a, ids);
    await assign(admin, ref, ids.opId);
    await review(opc, ref, 'INCOMPLETE', 'Паспортын хуулбар бүдэг, E7654321');
  });

  test('илгээх, хуваарилах, “Дутуу” → зөв хүлээн авагчид мэдэгдэл', async () => {
    const mine = (await a.get('/api/notifications')).body;
    assert.deepEqual(
      mine.items.map((x) => x.kind),
      ['REVIEW_INCOMPLETE', 'APP_SUBMITTED'],
    );
    assert.equal(mine.unread, 2);
    assert.equal(mine.items[0].link, `/app/applications/${ref}`);
    const ops = (await opc.get('/api/notifications')).body.items;
    assert.ok(ops.some((x) => x.kind === 'APP_ASSIGNED' && x.link === `/operator/applications/${ref}`));
  });

  test('нэмэлт багц → операторт; “Бүрэн”, хүргүүлсэн → мэдүүлэгчид', async () => {
    await a.post(`/api/app/applications/${ref}/supplements`);
    await a.multipart(`/api/app/applications/${ref}/supplements/1/documents`, { requirementId: ids.reqIds.PASSPORT_COPY }, [
      { buf: PDF, name: 'p.pdf' },
    ]);
    await a.post(`/api/app/applications/${ref}/supplements/1/submit`);
    await review(opc, ref, 'COMPLETE');
    await opc.multipart(
      `/api/operator/applications/${ref}/handover`,
      { authority: 'KVAC', officialRef: 'K-1', deliveredOn: new Date().toISOString().slice(0, 10) },
      [{ buf: PDF, name: 'r.pdf' }],
    );
    const kinds = (await a.get('/api/notifications')).body.items.map((x) => x.kind);
    assert.ok(kinds.includes('REVIEW_COMPLETE') && kinds.includes('HANDOVER_RECORDED'));
    assert.ok((await opc.get('/api/notifications')).body.items.some((x) => x.kind === 'SUPPLEMENT_SUBMITTED'));
  });

  test('уншсан тэмдэглэх; бусдын мэдэгдэл 404', async () => {
    const items = (await a.get('/api/notifications')).body.items;
    assert.equal((await opc.post(`/api/notifications/${items[0].id}/read`)).status, 404);
    assert.equal((await a.post(`/api/notifications/${items[0].id}/read`)).status, 200);
    assert.equal(
      (await a.get('/api/notifications?unread=1')).body.items.some((x) => x.id === items[0].id),
      false,
    );
    await a.post('/api/notifications/read-all');
    assert.equal((await a.get('/api/notifications')).body.unread, 0);
  });

  test('outbox: баталгаажсан хаяг руу илгээнэ; захидалд тайлбар, паспорт байхгүй; баталгаажаагүй бол SKIPPED', async () => {
    const before = outbox.length;
    await dispatchPending();
    const sent = outbox.slice(before);
    assert.ok(sent.length >= 5, String(sent.length));
    const forRef = sent.filter((m) => m.text.includes(ref));
    assert.ok(forRef.length >= 5);
    for (const m of sent) {
      assert.ok(!m.text.includes('E7654321') && !m.text.includes('бүдэг'), 'тайлбар/паспорт захидалд орохгүй');
    }
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM notifications WHERE email_status = 'PENDING'")).n), 0);
    // Баталгаажаагүй хэрэглэгчид захидал явуулахгүй
    const uid = (await one('SELECT user_id FROM users WHERE email = ?', ['verify.me@example.com'])).user_id;
    await query('UPDATE users SET email_verified_at = NULL WHERE user_id = ?', [uid]);
    await query("INSERT INTO notifications (user_id, kind, ref) VALUES (?, 'REVIEW_COMPLETE', 'KR-X')", [uid]);
    await dispatchPending();
    assert.equal(
      (await one('SELECT email_status FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 1', [uid])).email_status,
      'SKIPPED',
    );
  });

  test('audit-д токен, нөөц код, имэйл хаяг бичигдээгүй', async () => {
    const leaks = await one(
      "SELECT COUNT(*) AS n FROM audit_events WHERE entity_key LIKE '%@%' OR CHAR_LENGTH(entity_key) > 40 AND entity_key NOT LIKE 'KR-%'",
    );
    assert.equal(Number(leaks.n), 0);
  });
});
