// Үе 5 — мониторинг. `/api/health` (readiness): өгөгдлийн сан ба файлын сан хоёулаа ажиллаж байвал 200, үгүй бол 503.
// ClamAV тохируулсан бол мэдээллийн чанартай (унавал `degraded`, 200 хэвээр — файл PENDING-ээр хүлээгдэнэ, D-39).
// Хариунд алдааны мессеж, хост, зам, хувилбараас өөр дотоод мэдээлэл оруулахгүй; шалтгааныг зөвхөн логт.
import fs from 'node:fs';
import { pool } from '../db.js';
import { logger } from './logger.js';
import { storageHealth } from './storage.js';
import { scannerEnabled, pingClamd } from './scanner.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const startedAt = Date.now();

/** fn-ийг хугацаатай ажиллуулж { ok, ms } буцаана. DB/S3 гацсан үед health хүсэлт өөрөө гацахгүй. */
async function timed(name, fn, timeoutMs) {
  const t0 = performance.now();
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`${name} timeout`), { code: 'TIMEOUT' })), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    logger.warn({ err, check: name }, 'health check failed');
    return { ok: false, ms: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth({ timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 3000) } = {}) {
  const [db, storage, clamav] = await Promise.all([
    timed('db', () => pool.query('SELECT 1'), timeoutMs),
    timed('storage', () => storageHealth(), timeoutMs),
    scannerEnabled() ? timed('clamav', () => pingClamd({ timeoutMs }), timeoutMs) : Promise.resolve(null),
  ]);
  const ok = db.ok && storage.ok;
  const status = !ok ? 'down' : clamav && !clamav.ok ? 'degraded' : 'ok';
  return {
    ok,
    status,
    version: pkg.version,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    checks: { db, storage, ...(clamav ? { clamav } : {}) },
  };
}
