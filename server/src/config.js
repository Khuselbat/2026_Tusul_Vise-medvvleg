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
  // Үе 3: файлын сан — local | s3 (MinIO, AWS S3 г.м.); сонголтоор AES-256-GCM шифрлэлт (тусдаа түлхүүр)
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    encrypt: process.env.STORAGE_ENCRYPT === '1',
    keyId: process.env.FILE_KEY_ID || 'f1',
    keyHex: process.env.FILE_KEY || (isProd ? '' : '1'.repeat(64)),
    oldKeys: process.env.FILE_KEYS_OLD || '',
    s3: {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || '',
      prefix: (process.env.S3_PREFIX || (isTest ? 'test/' : '')).replace(/^\/+/, ''),
      accessKeyId: process.env.S3_ACCESS_KEY || '',
      secretAccessKey: process.env.S3_SECRET_KEY || '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== '0',
    },
  },
  // Үе 3: вирус шалгалт (clamd). CLAMAV_HOST тохируулаагүй бол зөвхөн magic byte шалгалт (одоогийнх)
  clamav: {
    host: process.env.CLAMAV_HOST || '',
    port: Number(process.env.CLAMAV_PORT || 3310),
    timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS || 30000),
  },
  // Үе 3: хадгалах хугацаа (өдөр). Илгээсэн мэдүүлгийн архивыг автоматаар устгахгүй — устгах хүсэлтээр (D-33)
  retention: {
    draftDays: Number(process.env.RETENTION_DRAFT_DAYS || 30),
    orphanFileHours: Number(process.env.RETENTION_ORPHAN_FILE_HOURS || 24),
    tokenDays: Number(process.env.RETENTION_TOKEN_DAYS || 30),
    sessionDays: Number(process.env.RETENTION_SESSION_DAYS || 30),
    notificationDays: Number(process.env.RETENTION_NOTIFICATION_DAYS || 365),
    runEveryHours: Number(process.env.RETENTION_RUN_EVERY_HOURS || 24),
  },
  clientDist: path.resolve(root, process.env.CLIENT_DIST || '../client/dist'),
  // BR-03: эхний хувилбарт зөвхөн БНСУ
  // Үе 2: имэйл доторх холбоосын үндэс (production-д домэйнээ заавал тохируулна)
  appUrl: (process.env.APP_URL || (isProd ? '' : 'http://localhost:5173')).replace(/\/+$/, ''),
  mail: {
    // smtp | file | memory | log. Production — smtp; dev — file (server/mail-outbox); test — memory
    transport: process.env.MAIL_TRANSPORT || (isProd ? 'smtp' : isTest ? 'memory' : 'file'),
    from: process.env.MAIL_FROM || 'Цахим виз <no-reply@localhost>',
    outboxDir: path.resolve(root, process.env.MAIL_OUTBOX_DIR || 'mail-outbox'),
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === '1',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Outbox-ийг дахин оролдох ажил (тестэд гараар дуудна)
    workerIntervalMs: Number(process.env.MAIL_WORKER_INTERVAL_MS || 60000),
  },
  // Ажилтны (оператор, админ) 2FA заавал. Зөвхөн dev/test-д MFA_REQUIRED=0-оор унтрааж болно.
  mfaRequired: isProd ? true : process.env.MFA_REQUIRED !== '0',
  // Мэдүүлэг илгээхээс өмнө имэйл баталгаажсан байх
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== '0',
  submittableCountries: (process.env.SUBMITTABLE_COUNTRIES || 'KR').split(',').map((s) => s.trim().toUpperCase()),
  limits: {
    fileBytes: 10 * 1024 * 1024, // BR-05: нэг файл ≤10 MB
    totalBytes: 100 * 1024 * 1024, // нийт ≤100 MB
  },
};
