import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { unauthorized, forbidden, HttpError } from '../lib/errors.js';

export const COOKIE = 'civiz_sid';

export function cookieOptions(maxAgeMs = config.sessionHours * 3600 * 1000) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Сесс үүсгэнэ (Үе 2): `user_sessions`-д мөр нэмж, JWT-д session_id (sid)-г оруулна.
 * Сесс серверт хадгалагдах тул гарах, “бүх төхөөрөмжөөс гарах”, нууц үг солиход даруй хүчингүй болно.
 */
export async function issueSession(req, res, user, q = query) {
  const sid = crypto.randomUUID();
  await q(
    'INSERT INTO user_sessions (session_id, user_id, expires_at, user_agent) VALUES (?,?, CURRENT_TIMESTAMP(6) + INTERVAL ? HOUR, ?)',
    [sid, user.user_id, config.sessionHours, String(req.headers['user-agent'] || '').slice(0, 200) || null],
  );
  const token = jwt.sign({ sub: user.public_id, sid }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, cookieOptions());
  return sid;
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Хэрэглэгчийн сессүүдийг хүчингүй болгоно (`exceptSid` — одоогийнхийг үлдээх). */
export async function revokeSessions(q, userId, { exceptSid = null } = {}) {
  const r = await q(
    `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP(6)
      WHERE user_id = ? AND revoked_at IS NULL ${exceptSid ? 'AND session_id <> ?' : ''}`,
    exceptSid ? [userId, exceptSid] : [userId],
  );
  return r.affectedRows;
}

/**
 * Хүсэлт бүрд хэрэглэгч ба сессийг өгөгдлийн сангаас дахин уншина — идэвхгүй болгосон хэрэглэгч,
 * хүчингүй болсон сесс даруй нэвтрэх эрхээ алдана (Зураг 59).
 */
export async function loadUser(req, _res, next) {
  req.user = null;
  req.sessionExpired = false;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    // Хүчингүй/хугацаа дууссан токен — зочин; хамгаалагдсан API “сесс дууссан” гэж хариулна (UC-04 E3)
    req.sessionExpired = true;
    return next();
  }
  try {
    const u = payload.sid
      ? await one(
          `SELECT u.user_id, u.public_id, u.email, u.display_name, u.is_active, u.email_verified_at, u.mfa_enabled_at, r.code AS role
             FROM user_sessions s JOIN users u ON u.user_id = s.user_id JOIN roles r ON r.role_id = u.role_id
            WHERE s.session_id = ? AND u.public_id = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(6)`,
          [payload.sid, payload.sub],
        )
      : null; // sid-гүй (Үе 2-оос өмнөх) токен хүчингүй
    if (u && u.is_active) {
      req.user = {
        id: u.user_id,
        publicId: u.public_id,
        email: u.email,
        name: u.display_name,
        role: u.role,
        emailVerified: !!u.email_verified_at,
        mfaEnabled: !!u.mfa_enabled_at,
        sid: payload.sid,
      };
      // Сүүлд идэвхтэй байсан цаг (5 минут тутам л бичнэ)
      await query(
        'UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP(6) WHERE session_id = ? AND last_seen_at < CURRENT_TIMESTAMP(6) - INTERVAL 5 MINUTE',
        [payload.sid],
      );
    } else {
      req.sessionExpired = true;
    }
    next();
  } catch (e) {
    next(e); // DB алдааг “нэвтрээгүй” гэж нуухгүй
  }
}

const SESSION_EXPIRED = 'Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.';
const notSignedIn = (req) =>
  req.sessionExpired ? new HttpError(401, 'SESSION_EXPIRED', SESSION_EXPIRED) : unauthorized('Нэвтрэх шаардлагатай.');

export function requireAuth(req, _res, next) {
  if (!req.user) return next(notSignedIn(req));
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(notSignedIn(req));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export const STAFF_ROLES = ['OPERATOR', 'ADMIN'];
