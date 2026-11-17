import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Орчны хувьсагч дутуу: ${name}`);
  return v;
}

// Хөгжүүлэлтийн орчинд л анхдагч түлхүүр зөвшөөрнө. Production-д заавал тохируулна.
const devSecret = isProd ? undefined : 'dev-only-change-me-0123456789abcdef';
const devKey = isProd ? undefined : '0'.repeat(64);

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: Number(process.env.PORT || 4000),
  trustProxy: process.env.TRUST_PROXY === '1',
  forceHttps: process.env.FORCE_HTTPS === '1',
  // Secure cookie: production-д анхдагчаар асаалттай (HTTPS шаардана). localhost-оос бусад HTTP орчинд туршихдаа COOKIE_SECURE=0
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : isProd,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'civiz',
    password: process.env.DB_PASSWORD ?? 'civiz_pass',
    database: isTest ? process.env.DB_NAME_TEST || 'civiz_test' : process.env.DB_NAME || 'civiz',
  },
  jwtSecret: required('JWT_SECRET', devSecret),
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  // Паспортын дугаарын AES-256-GCM түлхүүр (64 hex тэмдэгт). KEY_ID-аар эргүүлэх боломжтой.
  passportKeyId: process.env.PASSPORT_KEY_ID || 'k1',
  passportKeyHex: required('PASSPORT_KEY', devKey),
  storageDir: path.resolve(root, process.env.STORAGE_DIR || (isTest ? 'storage-test' : 'storage')),
  clientDist: path.resolve(root, process.env.CLIENT_DIST || '../client/dist'),
  // BR-03: эхний хувилбарт зөвхөн БНСУ
  submittableCountries: (process.env.SUBMITTABLE_COUNTRIES || 'KR').split(',').map((s) => s.trim().toUpperCase()),
  limits: {
    fileBytes: 10 * 1024 * 1024, // BR-05: нэг файл ≤10 MB
    totalBytes: 100 * 1024 * 1024, // нийт ≤100 MB
  },
};
