// Имэйл баталгаажуулалт, нууц үг сэргээх, SMTP алдаа, админы туршилтын имэйл.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pool, one, query } from '../src/db.js';
import { config } from '../src/config.js';
import { outbox, resetMailReadyCache, mailStatus } from '../src/lib/mailer.js';
import { setup, client, login, DEMO } from './helpers.js';

let app;
const tokenFrom = (mail) => decodeURIComponent(mail.text.match(/token=([^\s&]+)/)[1]);
const lastMailTo = (email) => [...outbox].reverse().find((m) => m.to === email);

/** SMTP-г “тохируулаагүй” болгож fn ажиллуулна (sendMail → MAIL_NOT_CONFIGURED, mailReady → алдаа) */
async function withBrokenMail(fn) {
  const saved = { transport: config.mail.transport, host: config.mail.smtp.host };
  config.mail.transport = 'smtp';
  config.mail.smtp.host = '';
  resetMailReadyCache();
  try {
    return await fn();
  } finally {
    config.mail.transport = saved.transport;
    config.mail.smtp.host = saved.host;
    resetMailReadyCache();
  }
}

async function register(email) {
  const c = client(app);
  const r = await c.post('/api/auth/register', { displayName: 'Имэйл Тест', email, password: 'Mail12345', passwordConfirm: 'Mail12345' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const l = await c.post('/api/auth/login', { email, password: 'Mail12345' });
  assert.equal(l.status, 200);
  return { c, r };
}

/** 60 сек хүлээлтийг тестэд алгасна */
const ageTokens = (email, purpose = 'VERIFY_EMAIL') =>
  query(
    `UPDATE user_tokens t JOIN users u ON u.user_id = t.user_id SET t.created_at = t.created_at - INTERVAL 2 MINUTE
      WHERE u.email = ? AND t.purpose = ?`,
    [email, purpose],
  );

before(async () => {
  ({ app } = await setup());
});
after(async () => {
  await pool.end();
});

describe('Имэйл баталгаажуулалт', () => {
  test('бүртгэлд холбоос илгээгдэнэ (APP_BASE_URL), токен 24 цаг, нэг удаа', async () => {
    const email = 'verify.once@example.com';
    const { c, r } = await register(email);
    assert.equal(r.body.mailSent, true);
    const mail = lastMailTo(email);
    assert.ok(mail.text.includes(`${config.appUrl}/verify-email?token=`), mail.text);
    const row = await one(
      `SELECT TIMESTAMPDIFF(MINUTE, t.created_at, t.expires_at) AS ttl FROM user_tokens t JOIN users u ON u.user_id = t.user_id
        WHERE u.email = ? AND t.purpose = 'VERIFY_EMAIL'`,
      [email],
    );
    assert.equal(Number(row.ttl), 24 * 60);
    const token = tokenFrom(mail);
    assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
    assert.ok((await one('SELECT email_verified_at FROM users WHERE email = ?', [email])).email_verified_at);
    // Давхар ашиглах
    const again = await c.post('/api/auth/verify-email', { token });
    assert.equal(again.status, 400);
    assert.match(again.body.error.message, /хүчингүй|хугацаа/);
  });

  test('хугацаа дууссан токен хүчингүй', async () => {
    const email = 'verify.expired@example.com';
    const { c } = await register(email);
    const token = tokenFrom(lastMailTo(email));
    await query(
      `UPDATE user_tokens t JOIN users u ON u.user_id = t.user_id SET t.expires_at = CURRENT_TIMESTAMP(6) - INTERVAL 1 SECOND
        WHERE u.email = ? AND t.purpose = 'VERIFY_EMAIL'`,
      [email],
    );
    assert.equal((await c.post('/api/auth/verify-email', { token })).status, 400);
    assert.equal((await one('SELECT email_verified_at FROM users WHERE email = ?', [email])).email_verified_at, null);
  });

  test('“Дахин илгээх”: 60 сек хүлээлт (429 + Retry-After), шинэ токен өмнөхийг хүчингүй болгоно', async () => {
    const email = 'verify.resend@example.com';
    const { c } = await register(email);
    const first = tokenFrom(lastMailTo(email));
    const tooSoon = await c.post('/api/auth/verify-email/resend');
    assert.equal(tooSoon.status, 429);
    assert.equal(tooSoon.body.error.code, 'RESEND_COOLDOWN');
    assert.ok(tooSoon.body.error.retryAfter > 0 && tooSoon.body.error.retryAfter <= 60);
    assert.ok(Number(tooSoon.headers['retry-after']) > 0);
    await ageTokens(email);
    const ok = await c.post('/api/auth/verify-email/resend');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.cooldownSec, 60);
    const second = tokenFrom(lastMailTo(email));
    assert.notEqual(first, second);
    assert.equal((await c.post('/api/auth/verify-email', { token: first })).status, 400, 'хуучин холбоос хүчингүй');
    assert.equal((await c.post('/api/auth/verify-email', { token: second })).status, 200);
  });

  test('илгээж чадаагүй бол ойлгомжтой мессеж (502), токен үлдэхгүй — шууд дахин оролдож болно', async () => {
    const email = 'verify.fail@example.com';
    const { c } = await register(email);
    await ageTokens(email);
    const r = await withBrokenMail(() => c.post('/api/auth/verify-email/resend'));
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'MAIL_NOT_CONFIGURED');
    assert.match(r.body.error.message, /илгээж чадсангүй/);
    assert.ok(!JSON.stringify(r.body).includes('SMTP_PASS'));
    const pending = await one(
      `SELECT COUNT(*) AS n FROM user_tokens t JOIN users u ON u.user_id = t.user_id
        WHERE u.email = ? AND t.purpose = 'VERIFY_EMAIL' AND t.used_at IS NULL`,
      [email],
    );
    assert.equal(Number(pending.n), 0);
    assert.equal((await c.post('/api/auth/verify-email/resend')).status, 200, 'хүлээлтгүйгээр дахин');
  });

  test('бүртгэлийн үед имэйл явж чадаагүй ч бүртгэл үүснэ, mailSent=false', async () => {
    const r = await withBrokenMail(() =>
      client(app).post('/api/auth/register', {
        displayName: 'Имэйл Алдаа',
        email: 'register.nomail@example.com',
        password: 'Mail12345',
        passwordConfirm: 'Mail12345',
      }),
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.mailSent, false);
  });
});

describe('Нууц үг сэргээх', () => {
  test('байгаа ба байхгүй имэйлд ижил хариу; токен 1 цаг, нэг удаа; хугацаа дууссан хүчингүй', async () => {
    const email = 'reset.user@example.com';
    await register(email);
    const before = outbox.length;
    const a = await client(app).post('/api/auth/password/forgot', { email: 'nobody.reset@example.com' });
    const b = await client(app).post('/api/auth/password/forgot', { email });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(outbox.length, before + 1, 'зөвхөн бүртгэлтэй хаяг руу');
    const mail = lastMailTo(email);
    assert.match(mail.text, /1 цагийн дотор/);
    const ttl = await one(
      `SELECT TIMESTAMPDIFF(MINUTE, t.created_at, t.expires_at) AS m FROM user_tokens t JOIN users u ON u.user_id = t.user_id
        WHERE u.email = ? AND t.purpose = 'RESET_PASSWORD' ORDER BY t.token_id DESC LIMIT 1`,
      [email],
    );
    assert.equal(Number(ttl.m), 60);
    const token = tokenFrom(mail);
    const body = { token, newPassword: 'NewPass123', newPasswordConfirm: 'NewPass123' };
    assert.equal((await client(app).post('/api/auth/password/reset', body)).status, 200);
    assert.equal((await client(app).post('/api/auth/password/reset', body)).status, 400, 'давхар ашиглахгүй');
    assert.equal((await client(app).post('/api/auth/login', { email, password: 'NewPass123' })).status, 200);

    await client(app).post('/api/auth/password/forgot', { email });
    const t2 = tokenFrom(lastMailTo(email));
    await query(
      `UPDATE user_tokens t JOIN users u ON u.user_id = t.user_id SET t.expires_at = CURRENT_TIMESTAMP(6) - INTERVAL 1 SECOND
        WHERE u.email = ? AND t.purpose = 'RESET_PASSWORD'`,
      [email],
    );
    const exp = await client(app).post('/api/auth/password/reset', {
      token: t2,
      newPassword: 'Other1234',
      newPasswordConfirm: 'Other1234',
    });
    assert.equal(exp.status, 400);
  });

  test('SMTP эвдэрсэн үед байгаа/байхгүй имэйлд ижил 503 (бүртгэл таагдахгүй)', async () => {
    const [a, b] = await withBrokenMail(async () => [
      await client(app).post('/api/auth/password/forgot', { email: 'nobody.503@example.com' }),
      await client(app).post('/api/auth/password/forgot', { email: DEMO.applicant.email }),
    ]);
    assert.equal(a.status, 503);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.error.code, 'MAIL_UNAVAILABLE');
  });
});

describe('Админ: туршилтын имэйл', () => {
  test('админы өөрийн хаяг руу; тохиргооны тойм нууц үг буцаахгүй; бусад эрх 403', async () => {
    const admin = await login(app, DEMO.admin);
    const st = await admin.get('/api/admin/mail/status');
    assert.equal(st.status, 200);
    assert.equal(st.body.transport, 'memory');
    for (const k of Object.keys(st.body)) assert.ok(!/^pass$|password$/i.test(k), k);
    const before = outbox.length;
    const r = await admin.post('/api/admin/mail/test');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.to, DEMO.admin.email);
    assert.equal(outbox.length, before + 1);
    assert.equal(outbox.at(-1).to, DEMO.admin.email);
    assert.ok(await one("SELECT 1 AS ok FROM audit_events WHERE action = 'MAIL_TEST'"));

    const applicant = await login(app, DEMO.applicant);
    assert.equal((await applicant.post('/api/admin/mail/test')).status, 403);
    assert.equal((await applicant.get('/api/admin/mail/status')).status, 403);
    // CSRF толгойгүй бол 403
    assert.equal((await admin.agent.post('/api/admin/mail/test')).status, 403);
  });

  test('SMTP алдаа: код + монгол мессеж (502), нууц үг задрахгүй', async () => {
    const admin = await login(app, DEMO.admin);
    const saved = config.mail.smtp.pass;
    config.mail.smtp.pass = 'super-secret-app-password';
    try {
      const r = await withBrokenMail(() => admin.post('/api/admin/mail/test'));
      assert.equal(r.status, 502);
      assert.equal(r.body.error.code, 'MAIL_NOT_CONFIGURED');
      assert.ok(!JSON.stringify(r.body).includes('super-secret'));
      const st = await withBrokenMail(() => admin.get('/api/admin/mail/status'));
      assert.equal(st.body.passwordSet, true);
      assert.ok(!JSON.stringify(st.body).includes('super-secret'));
      assert.equal(mailStatus().configured, true);
    } finally {
      config.mail.smtp.pass = saved;
    }
  });
});
