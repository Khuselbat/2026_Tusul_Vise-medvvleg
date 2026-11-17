// Нэг удаагийн, хугацаатай токен (имэйл баталгаажуулах, нууц үг сэргээх, 2FA-ийн завсрын алхам).
// Санд зөвхөн SHA-256 хэш; түүхий токен зөвхөн хэрэглэгчид (имэйл/cookie) очно.
import crypto from 'node:crypto';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newRaw = () => crypto.randomBytes(32).toString('base64url');

/** Шинэ токен; ижил зорилгын өмнөх ашиглаагүй токенуудыг хүчингүй болгоно. */
export async function createToken(q, { userId, purpose, ttlMinutes }) {
  await q('UPDATE user_tokens SET used_at = CURRENT_TIMESTAMP(6) WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  const raw = newRaw();
  await q('INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?,?,?, CURRENT_TIMESTAMP(6) + INTERVAL ? MINUTE)', [
    userId,
    purpose,
    sha256(raw),
    ttlMinutes,
  ]);
  return raw;
}

/** Хүчинтэй токены мөрийг түгжиж буцаана (ашиглаагүй, хугацаа дуусаагүй); үгүй бол null. */
export async function findToken(q, raw, purpose) {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  const rows = await q(
    `SELECT * FROM user_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP(6) FOR UPDATE`,
    [sha256(raw), purpose],
  );
  return rows[0] || null;
}

export async function markUsed(q, tokenId) {
  await q('UPDATE user_tokens SET used_at = CURRENT_TIMESTAMP(6) WHERE token_id = ?', [tokenId]);
}
