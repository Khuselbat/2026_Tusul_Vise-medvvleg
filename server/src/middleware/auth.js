import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { unauthorized, forbidden, HttpError } from '../lib/errors.js';

export const COOKIE = 'civiz_sid';

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  };
}

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.public_id }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, cookieOptions());
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/**
 * Хүсэлт бүрд хэрэглэгчийг өгөгдлийн сангаас дахин уншина — идэвхгүй болгосон
 * хэрэглэгч даруй нэвтрэх эрхээ алдана (Зураг 59).
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
    const u = await one(
      `SELECT u.user_id, u.public_id, u.email, u.display_name, u.is_active, r.code AS role
         FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.public_id = ?`,
      [payload.sub],
    );
    if (u && u.is_active) {
      req.user = { id: u.user_id, publicId: u.public_id, email: u.email, name: u.display_name, role: u.role };
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
