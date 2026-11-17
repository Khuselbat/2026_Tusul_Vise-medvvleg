import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, tx } from '../db.js';
import { wrap, parse, badRequest, conflict, notFound, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { encryptPassport as encryptSecret, decryptPassport as decryptSecret } from '../lib/crypto.js';
import { sendMail, verifyEmailMail, resetPasswordMail } from '../lib/mailer.js';
import { createToken, findToken, markUsed, sha256 } from '../lib/tokens.js';
import { generateSecret, otpauthUrl, verifyCode } from '../lib/totp.js';
import { issueSession, clearSession, requireAuth, revokeSessions, cookieOptions, STAFF_ROLES } from '../middleware/auth.js';

const r = Router();
const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const MFA_COOKIE = 'civiz_mfa';
const MFA_TTL_MIN = 10;
const MFA_MAX_ATTEMPTS = 5;

const limiter = (limit, minutes, key) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: config.isTest ? 1000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: key,
    handler: (_req, _res, next) => next(new HttpError(429, 'TOO_MANY', `Олон удаа оролдлоо. ${minutes} минутын дараа дахин оролдоно уу.`)),
  });
const ipEmail = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`;

// Нэвтрэх оролдлогыг сервер хязгаарлана (Зураг 38)
const loginLimiter = limiter(10, 15, ipEmail);
const forgotLimiter = limiter(5, 15, ipEmail);
const resendLimiter = limiter(3, 60, (req) => `u${req.user?.id}`);
const mfaLimiter = limiter(20, 15, (req) => ipKeyGenerator(req.ip));

export const passwordSchema = z
  .string()
  .min(8, 'Нууц үг дор хаяж 8 тэмдэгт байна.')
  .max(128, 'Нууц үг хэт урт байна.')
  .regex(/[A-Za-zА-Яа-яӨөҮүЁё]/, 'Нууц үгэнд үсэг орно.')
  .regex(/\d/, 'Нууц үгэнд тоо орно.');

const emailSchema = z.string().trim().toLowerCase().min(1, 'Имэйл оруулна уу.').max(254).email('Имэйлийн хэлбэр буруу байна.');

const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Нэрээ оруулна уу.').max(150),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: 'Нууц үг таарахгүй байна.' });

/** Имэйл илгээлт бүтэлгүйтсэн ч хэрэглэгчийн үйлдлийг унагаахгүй (логлоно). */
async function trySend(mail, to) {
  try {
    await sendMail({ to, ...mail });
  } catch (err) {
    logger.error({ err }, 'transactional mail failed');
  }
}

const publicUser = (u) => ({
  publicId: u.public_id,
  email: u.email,
  name: u.display_name,
  role: u.role,
  emailVerified: !!u.email_verified_at,
  mfaEnabled: !!u.mfa_enabled_at,
});

const USER_SELECT = `SELECT u.user_id, u.public_id, u.email, u.password_hash, u.is_active, u.display_name, u.email_verified_at,
       u.mfa_secret_enc, u.mfa_key_id, u.mfa_enabled_at, u.mfa_last_step, r.code AS role
  FROM users u JOIN roles r ON r.role_id = u.role_id`;

// ───────────── UC-01 Бүртгүүлэх — үргэлж APPLICANT; имэйл баталгаажуулах холбоос илгээнэ ─────────────
r.post(
  '/register',
  wrap(async (req, res) => {
    const data = parse(registerSchema, req.body);
    const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    let out;
    try {
      out = await tx(async (q) => {
        const ins = await q(
          `INSERT INTO users (public_id, role_id, email, password_hash, display_name)
         VALUES (?, (SELECT role_id FROM roles WHERE code='APPLICANT'), ?, ?, ?)`,
          [crypto.randomUUID(), data.email, hash, data.displayName],
        );
        const token = await createToken(q, { userId: ins.insertId, purpose: 'VERIFY_EMAIL', ttlMinutes: 24 * 60 });
        await audit(req, { action: 'USER_REGISTER', entityType: 'user', entityKey: ins.insertId, actorId: ins.insertId }, q);
        return { userId: ins.insertId, token };
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        throw conflict('Энэ имэйлээр бүртгэл үүссэн байна.', { fields: { email: 'Энэ имэйлээр бүртгэл үүссэн байна.' } });
      }
      throw e;
    }
    await trySend(verifyEmailMail(out.token), data.email);
    res.status(201).json({ ok: true, userId: out.userId });
  }),
);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Нууц үгээ оруулна уу.').max(256),
});

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 4);

// ───────────── UC-02 Нэвтрэх. Ажилтан бол 2FA (TOTP) — сесс зөвхөн код зөвшөөрөгдсөний дараа ─────────────
r.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const data = parse(loginSchema, req.body);
    const u = await one(`${USER_SELECT} WHERE u.email = ?`, [data.email]);
    const ok = await bcrypt.compare(data.password, u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok || !u.is_active) {
      await audit(req, { action: 'LOGIN_FAILED', entityType: 'user', entityKey: u?.user_id ?? null, actorId: null });
      // E1: ерөнхий алдааны мэдэгдэл — аль талбар буруу болохыг задлахгүй
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Имэйл эсвэл нууц үг буруу байна.');
    }
    if (config.mfaRequired && STAFF_ROLES.includes(u.role)) {
      const token = await tx(async (q) => {
        const t = await createToken(q, { userId: u.user_id, purpose: 'MFA_PENDING', ttlMinutes: MFA_TTL_MIN });
        await audit(req, { action: 'LOGIN_MFA_CHALLENGE', entityType: 'user', entityKey: u.user_id, actorId: u.user_id }, q);
        return t;
      });
      res.cookie(MFA_COOKIE, token, { ...cookieOptions(MFA_TTL_MIN * 60 * 1000), path: '/api/auth/mfa' });
      return res.json({ mfa: u.mfa_enabled_at ? 'VERIFY' : 'ENROLL' });
    }
    await issueSession(req, res, u);
    await audit(req, { action: 'LOGIN', entityType: 'user', entityKey: u.user_id, actorId: u.user_id });
    res.json({ user: publicUser(u) });
  }),
);

r.post(
  '/logout',
  wrap(async (req, res) => {
    if (req.user) {
      await query('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP(6) WHERE session_id = ? AND revoked_at IS NULL', [req.user.sid]);
      await audit(req, { action: 'LOGOUT', entityType: 'user', entityKey: req.user.id });
    }
    clearSession(res);
    res.json({ ok: true });
  }),
);

r.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { publicId, email, name, role, emailVerified, mfaEnabled } = req.user;
  res.json({ user: { publicId, email, name, role, emailVerified, mfaEnabled } });
});

// Зураг 49 Профайл — нэр солих
r.put(
  '/me/profile',
  requireAuth,
  wrap(async (req, res) => {
    const { displayName } = parse(z.object({ displayName: z.string().trim().min(2, 'Нэрээ оруулна уу.').max(150) }), req.body);
    await query('UPDATE users SET display_name = ? WHERE user_id = ?', [displayName, req.user.id]);
    await audit(req, { action: 'PROFILE_UPDATE', entityType: 'user', entityKey: req.user.id });
    res.json({ ok: true, name: displayName });
  }),
);

// Нууц үг солих — одоогийн нууц үгийг баталгаажуулна; бусад бүх сессийг хүчингүй болгоно (Үе 2)
r.put(
  '/me/password',
  requireAuth,
  wrap(async (req, res) => {
    const data = parse(
      z
        .object({
          currentPassword: z.string().min(1, 'Одоогийн нууц үгээ оруулна уу.'),
          newPassword: passwordSchema,
          newPasswordConfirm: z.string(),
        })
        .refine((d) => d.newPassword === d.newPasswordConfirm, { path: ['newPasswordConfirm'], message: 'Нууц үг таарахгүй байна.' }),
      req.body,
    );
    const u = await one('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id]);
    if (!(await bcrypt.compare(data.currentPassword, u.password_hash))) {
      throw badRequest('Одоогийн нууц үг буруу байна.', { fields: { currentPassword: 'Одоогийн нууц үг буруу байна.' } });
    }
    const hash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    const revoked = await tx(async (q) => {
      await q('UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?', [hash, req.user.id]);
      const n = await revokeSessions(q, req.user.id, { exceptSid: req.user.sid });
      await audit(req, { action: 'PASSWORD_CHANGE', entityType: 'user', entityKey: req.user.id }, q);
      return n;
    });
    res.json({ ok: true, otherSessionsRevoked: revoked });
  }),
);

// ───────────── Имэйл баталгаажуулалт ─────────────
const tokenBody = z.object({ token: z.string().min(10).max(200) });
const INVALID_LINK = 'Холбоос хүчингүй эсвэл хугацаа нь дууссан байна.';

r.post(
  '/verify-email',
  wrap(async (req, res) => {
    const { token } = parse(tokenBody, req.body);
    const ok = await tx(async (q) => {
      const t = await findToken(q, token, 'VERIFY_EMAIL');
      if (!t) return false;
      await markUsed(q, t.token_id);
      await q('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP(6)) WHERE user_id = ?', [t.user_id]);
      await audit(req, { action: 'EMAIL_VERIFY', entityType: 'user', entityKey: t.user_id, actorId: t.user_id }, q);
      return true;
    });
    if (!ok) throw badRequest(INVALID_LINK);
    res.json({ ok: true });
  }),
);

r.post(
  '/verify-email/resend',
  requireAuth,
  resendLimiter,
  wrap(async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    const token = await tx(async (q) => {
      const t = await createToken(q, { userId: req.user.id, purpose: 'VERIFY_EMAIL', ttlMinutes: 24 * 60 });
      await audit(req, { action: 'EMAIL_VERIFY_RESEND', entityType: 'user', entityKey: req.user.id }, q);
      return t;
    });
    await trySend(verifyEmailMail(token), req.user.email);
    res.json({ ok: true });
  }),
);

// ───────────── Нууц үг сэргээх — хэрэглэгч байгаа эсэхийг илчлэхгүй ─────────────
const FORGOT_OK = 'Хэрэв энэ имэйлээр бүртгэл байгаа бол нууц үг сэргээх холбоос илгээгдэнэ. Ирсэн имэйлээ шалгана уу.';

async function processForgot(req, email) {
  const u = await one('SELECT user_id, email, is_active FROM users WHERE email = ?', [email]);
  if (!u || !u.is_active) return;
  const token = await tx(async (q) => {
    const t = await createToken(q, { userId: u.user_id, purpose: 'RESET_PASSWORD', ttlMinutes: 30 });
    await audit(req, { action: 'PASSWORD_RESET_REQUEST', entityType: 'user', entityKey: u.user_id, actorId: null }, q);
    return t;
  });
  await trySend(resetPasswordMail(token), u.email);
}

r.post(
  '/password/forgot',
  forgotLimiter,
  wrap(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    // Хариуг шууд, ижил хугацаанд буцааж, ажлыг ар талд хийнэ (хугацааны ялгаагаар бүртгэл таагдахгүй)
    if (config.isTest) await processForgot(req, email);
    else setImmediate(() => processForgot(req, email).catch((err) => logger.error({ err }, 'forgot password failed')));
    res.json({ ok: true, message: FORGOT_OK });
  }),
);

r.post(
  '/password/reset',
  wrap(async (req, res) => {
    const data = parse(
      z
        .object({ token: z.string().min(10).max(200), newPassword: passwordSchema, newPasswordConfirm: z.string() })
        .refine((d) => d.newPassword === d.newPasswordConfirm, { path: ['newPasswordConfirm'], message: 'Нууц үг таарахгүй байна.' }),
      req.body,
    );
    const hash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    const ok = await tx(async (q) => {
      const t = await findToken(q, data.token, 'RESET_PASSWORD');
      if (!t) return false;
      await markUsed(q, t.token_id);
      // Имэйлээр ирсэн холбоосыг ашигласан нь хаягийг эзэмшиж буйг нотолно
      await q(
        `UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP(6),
                email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP(6)) WHERE user_id = ?`,
        [hash, t.user_id],
      );
      await revokeSessions(q, t.user_id);
      await audit(req, { action: 'PASSWORD_RESET', entityType: 'user', entityKey: t.user_id, actorId: t.user_id }, q);
      return true;
    });
    if (!ok) throw badRequest(INVALID_LINK);
    res.json({ ok: true });
  }),
);

// ───────────── Сесс удирдлага ─────────────
r.get(
  '/sessions',
  requireAuth,
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT session_id, created_at, last_seen_at, expires_at, user_agent FROM user_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(6) ORDER BY last_seen_at DESC`,
      [req.user.id],
    );
    res.json({
      items: rows.map((s) => ({
        id: s.session_id,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        expiresAt: s.expires_at,
        userAgent: s.user_agent,
        current: s.session_id === req.user.sid,
      })),
    });
  }),
);

r.delete(
  '/sessions/:sid',
  requireAuth,
  wrap(async (req, res) => {
    const n = await query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP(6) WHERE session_id = ? AND user_id = ? AND revoked_at IS NULL',
      [String(req.params.sid), req.user.id],
    );
    if (!n.affectedRows) throw notFound('Сесс олдсонгүй.');
    await audit(req, { action: 'SESSION_REVOKE', entityType: 'user', entityKey: req.user.id });
    if (req.params.sid === req.user.sid) clearSession(res);
    res.json({ ok: true });
  }),
);

// Бүх төхөөрөмжөөс гарах (одоогийн сесс орно)
r.post(
  '/sessions/revoke-all',
  requireAuth,
  wrap(async (req, res) => {
    const n = await tx(async (q) => {
      const c = await revokeSessions(q, req.user.id);
      await audit(req, { action: 'SESSION_REVOKE_ALL', entityType: 'user', entityKey: req.user.id }, q);
      return c;
    });
    clearSession(res);
    res.json({ ok: true, revoked: n });
  }),
);

// ───────────── Ажилтны 2FA (TOTP) ─────────────
const MFA_EXPIRED = () => new HttpError(401, 'MFA_EXPIRED', 'Баталгаажуулалтын хугацаа дууссан. Дахин нэвтэрнэ үү.');
const MFA_INVALID = () =>
  new HttpError(400, 'MFA_INVALID', 'Код буруу байна. Дахин оролдоно уу.', { fields: { code: 'Код буруу байна.' } });

/** Нууц үг зөв оруулсан, 2FA хүлээж буй хэрэглэгч (cookie токеноор). */
async function pendingMfa(req, q) {
  const t = await findToken(q, req.cookies?.[MFA_COOKIE], 'MFA_PENDING');
  if (!t) throw MFA_EXPIRED();
  const u = (await q(`${USER_SELECT} WHERE u.user_id = ? FOR UPDATE`, [t.user_id]))[0];
  if (!u || !u.is_active) throw MFA_EXPIRED();
  return { t, u };
}

/** Буруу код: оролдлогыг тоолж, 5 хүрвэл токеныг хүчингүй болгоно. */
async function failAttempt(q, t) {
  // MySQL SET-ийг зүүнээс баруун тийш үнэлдэг тул used_at-ийг attempts-ээс ӨМНӨ (хуучин утгаар) тооцно
  await q(
    'UPDATE user_tokens SET used_at = IF(attempts + 1 >= ?, CURRENT_TIMESTAMP(6), used_at), attempts = attempts + 1 WHERE token_id = ?',
    [MFA_MAX_ATTEMPTS, t.token_id],
  );
}

const clearMfaCookie = (res) => res.clearCookie(MFA_COOKIE, { ...cookieOptions(), maxAge: undefined, path: '/api/auth/mfa' });

function recoveryCodes(n = 10) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => A[x % A.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
const normRecovery = (c) =>
  String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// Бүртгүүлэх 1: нууц үүсгэж QR буцаана (баталгаажуулах хүртэл идэвхгүй)
r.post(
  '/mfa/setup',
  mfaLimiter,
  wrap(async (req, res) => {
    const out = await tx(async (q) => {
      const { u } = await pendingMfa(req, q);
      if (u.mfa_enabled_at) throw conflict('2FA аль хэдийн тохируулагдсан. Кодоо оруулна уу.');
      const secret = generateSecret();
      const enc = encryptSecret(secret);
      await q('UPDATE users SET mfa_secret_enc = ?, mfa_key_id = ?, mfa_last_step = NULL WHERE user_id = ?', [
        enc.data,
        enc.keyId,
        u.user_id,
      ]);
      return { secret, account: u.email };
    });
    const uri = otpauthUrl({ secret: out.secret, account: out.account });
    res.json({ secret: out.secret, otpauthUrl: uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
  }),
);

// Бүртгүүлэх 2: эхний кодоор баталгаажуулж идэвхжүүлнэ → нөөц код (нэг удаа харуулна) + сесс
r.post(
  '/mfa/enable',
  mfaLimiter,
  wrap(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().trim().max(10) }), req.body);
    const out = await tx(async (q) => {
      const { t, u } = await pendingMfa(req, q);
      if (u.mfa_enabled_at) throw conflict('2FA аль хэдийн тохируулагдсан.');
      if (!u.mfa_secret_enc) throw badRequest('Эхлээд QR кодыг уншуулна уу.');
      const step = verifyCode(decryptSecret(u.mfa_secret_enc, u.mfa_key_id), code);
      if (step === null) {
        await failAttempt(q, t);
        return { error: MFA_INVALID() };
      }
      const codes = recoveryCodes();
      await q('UPDATE users SET mfa_enabled_at = CURRENT_TIMESTAMP(6), mfa_last_step = ? WHERE user_id = ?', [step, u.user_id]);
      await q('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [u.user_id]);
      for (const c of codes)
        await q('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?,?)', [u.user_id, sha256(normRecovery(c))]);
      await markUsed(q, t.token_id);
      await issueSession(req, res, u, q);
      await audit(req, { action: 'MFA_ENABLE', entityType: 'user', entityKey: u.user_id, actorId: u.user_id }, q);
      await audit(req, { action: 'LOGIN', entityType: 'user', entityKey: u.user_id, actorId: u.user_id }, q);
      return { user: publicUser({ ...u, mfa_enabled_at: new Date() }), recoveryCodes: codes };
    });
    if (out.error) throw out.error;
    clearMfaCookie(res);
    res.json(out);
  }),
);

// Нэвтрэх: TOTP код эсвэл нөөц код (нэг удаа)
r.post(
  '/mfa/verify',
  mfaLimiter,
  wrap(async (req, res) => {
    const d = parse(
      z
        .object({ code: z.string().trim().max(10).optional(), recoveryCode: z.string().trim().max(20).optional() })
        .refine((x) => x.code || x.recoveryCode, { path: ['code'], message: 'Кодоо оруулна уу.' }),
      req.body,
    );
    const out = await tx(async (q) => {
      const { t, u } = await pendingMfa(req, q);
      if (!u.mfa_enabled_at) throw conflict('2FA тохируулаагүй байна.');
      let usedRecovery = false;
      if (d.code) {
        const step = verifyCode(decryptSecret(u.mfa_secret_enc, u.mfa_key_id), d.code, { afterStep: u.mfa_last_step ?? -1 });
        if (step === null) {
          await failAttempt(q, t);
          return { error: MFA_INVALID() };
        }
        await q('UPDATE users SET mfa_last_step = ? WHERE user_id = ?', [step, u.user_id]);
      } else {
        const rc = (
          await q('SELECT code_id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL FOR UPDATE', [
            u.user_id,
            sha256(normRecovery(d.recoveryCode)),
          ])
        )[0];
        if (!rc) {
          await failAttempt(q, t);
          return { error: MFA_INVALID() };
        }
        await q('UPDATE mfa_recovery_codes SET used_at = CURRENT_TIMESTAMP(6) WHERE code_id = ?', [rc.code_id]);
        usedRecovery = true;
      }
      await markUsed(q, t.token_id);
      await issueSession(req, res, u, q);
      if (usedRecovery) await audit(req, { action: 'MFA_RECOVERY_USED', entityType: 'user', entityKey: u.user_id, actorId: u.user_id }, q);
      await audit(req, { action: 'LOGIN', entityType: 'user', entityKey: u.user_id, actorId: u.user_id }, q);
      const left = Number(
        (await q('SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL', [u.user_id]))[0].n,
      );
      return { user: publicUser(u), recoveryCodesLeft: left };
    });
    if (out.error) throw out.error;
    clearMfaCookie(res);
    res.json(out);
  }),
);

export default r;
export { BCRYPT_ROUNDS };
