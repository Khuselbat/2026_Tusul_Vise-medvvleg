import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, tx } from '../db.js';
import { wrap, parse, badRequest, conflict, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { issueSession, clearSession, requireAuth } from '../middleware/auth.js';

const r = Router();
const BCRYPT_ROUNDS = config.isTest ? 4 : 12;

// Нэвтрэх оролдлогыг сервер хязгаарлана (Зураг 38)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
  handler: (_req, _res, next) => next(new HttpError(429, 'TOO_MANY', 'Олон удаа оролдлоо. 15 минутын дараа дахин оролдоно уу.')),
});

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

// UC-01 Бүртгүүлэх — үргэлж APPLICANT эрхтэй (эрх сонгох талбар байхгүй)
r.post(
  '/register',
  wrap(async (req, res) => {
    const data = parse(registerSchema, req.body);
    const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    try {
      const userId = await tx(async (q) => {
        const ins = await q(
          `INSERT INTO users (public_id, role_id, email, password_hash, display_name)
         VALUES (?, (SELECT role_id FROM roles WHERE code='APPLICANT'), ?, ?, ?)`,
          [crypto.randomUUID(), data.email, hash, data.displayName],
        );
        await audit(req, { action: 'USER_REGISTER', entityType: 'user', entityKey: ins.insertId, actorId: ins.insertId }, q);
        return ins.insertId;
      });
      res.status(201).json({ ok: true, userId });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        throw conflict('Энэ имэйлээр бүртгэл үүссэн байна.', { fields: { email: 'Энэ имэйлээр бүртгэл үүссэн байна.' } });
      }
      throw e;
    }
  }),
);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Нууц үгээ оруулна уу.').max(256),
});

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 4);

// UC-02 Нэвтрэх
r.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const data = parse(loginSchema, req.body);
    const u = await one(
      `SELECT u.user_id, u.public_id, u.password_hash, u.is_active, u.display_name, u.email, r.code AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.email = ?`,
      [data.email],
    );
    const ok = await bcrypt.compare(data.password, u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok || !u.is_active) {
      await audit(req, { action: 'LOGIN_FAILED', entityType: 'user', entityKey: u?.user_id ?? null, actorId: null });
      // E1: ерөнхий алдааны мэдэгдэл — аль талбар буруу болохыг задлахгүй
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Имэйл эсвэл нууц үг буруу байна.');
    }
    issueSession(res, u);
    await audit(req, { action: 'LOGIN', entityType: 'user', entityKey: u.user_id, actorId: u.user_id });
    res.json({ user: { publicId: u.public_id, email: u.email, name: u.display_name, role: u.role } });
  }),
);

r.post(
  '/logout',
  wrap(async (req, res) => {
    if (req.user) await audit(req, { action: 'LOGOUT', entityType: 'user', entityKey: req.user.id });
    clearSession(res);
    res.json({ ok: true });
  }),
);

r.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { publicId, email, name, role } = req.user;
  res.json({ user: { publicId, email, name, role } });
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

// Нууц үг солих — одоогийн нууц үгийг баталгаажуулна
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
    await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS), req.user.id]);
    await audit(req, { action: 'PASSWORD_CHANGE', entityType: 'user', entityKey: req.user.id });
    res.json({ ok: true });
  }),
);

export default r;
export { BCRYPT_ROUNDS };
