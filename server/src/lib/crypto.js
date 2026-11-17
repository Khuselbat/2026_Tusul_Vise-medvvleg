import crypto from 'node:crypto';
import { config } from '../config.js';

// Паспортын дугаарыг AES-256-GCM-ээр шифрлэнэ: [12 байт IV][16 байт tag][ciphertext]
const keys = new Map([[config.passportKeyId, Buffer.from(config.passportKeyHex, 'hex')]]);
// Хуучин түлхүүр: PASSPORT_KEY_OLD="k0:hex,..." хэлбэрээр нэмж болно
for (const pair of (process.env.PASSPORT_KEYS_OLD || '').split(',').filter(Boolean)) {
  const [id, hex] = pair.split(':');
  keys.set(id, Buffer.from(hex, 'hex'));
}
for (const [id, k] of keys) {
  if (k.length !== 32) throw new Error(`PASSPORT_KEY (${id}) нь 32 байт (64 hex) байх ёстой.`);
}

export function encryptPassport(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(config.passportKeyId), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { data: Buffer.concat([iv, cipher.getAuthTag(), enc]), keyId: config.passportKeyId };
}

export function decryptPassport(buf, keyId) {
  const key = keys.get(keyId);
  if (!key) return null;
  const b = Buffer.from(buf);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8');
}

export function maskPassport(p) {
  if (!p) return '—';
  return p.length <= 3 ? '***' : `${'•'.repeat(p.length - 3)}${p.slice(-3)}`;
}

/** Хэрэглэгчид харуулах дотоод лавлах дугаар: KR-20261111-7F3K9Q */
export function makeReference(iso) {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(6)) s += alphabet[b % alphabet.length];
  return `${iso}-${ymd}-${s}`;
}
