// Өгөгдлийн сангийн migration: database/migrations/NNN_name.sql файлуудыг дарааллаар нь,
// зөвхөн хэрэгжээгүйг нь ажиллуулна. Хэрэгжсэн файлын checksum өөрчлөгдвөл зогсооно.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'database', 'migrations');
const FILE_RE = /^(\d{3,})_[a-z0-9_]+\.sql$/;
const LOCK = 'civiz_migrate';

const sha256 = (s) => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const out = [];
  for (const f of files) {
    const m = FILE_RE.exec(f);
    if (!m) throw new Error(`Migration файлын нэр буруу: ${f} (жишээ: 002_add_supplements.sql)`);
    const sql = await fs.readFile(path.join(dir, f), 'utf8');
    out.push({ version: m[1], name: f, sql, checksum: sha256(sql) });
  }
  const seen = new Set();
  for (const m of out) {
    if (seen.has(m.version)) throw new Error(`Migration дугаар давхардсан: ${m.version}`);
    seen.add(m.version);
  }
  return out;
}

function connect() {
  return mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
}

async function ensureTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(20)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    checksum    CHAR(64)     NOT NULL,
    applied_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

/**
 * Migration системээс өмнө хуучин `schema.sql`-ээр үүссэн сан: хүснэгтүүд байгаа ч schema_migrations хоосон.
 * Ийм үед 001_init-ийг дахин ажиллуулахгүй, хэрэгжсэн гэж тэмдэглэнэ (baseline).
 */
async function baselineLegacy(conn, files, log) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM schema_migrations');
  if (Number(n) > 0 || files[0]?.version !== '001') return;
  const [legacy] = await conn.query(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('roles','users','applications')",
  );
  if (legacy.length < 3) return;
  await conn.query('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)', [files[0].version, files[0].name, files[0].checksum]);
  log(`Хуучин схем илэрлээ — ${files[0].name}-ийг хэрэгжсэн гэж тэмдэглэв (baseline).`);
}

/**
 * Хэрэгжээгүй migration-уудыг ажиллуулна. Өгөгдөл УСТГАХГҮЙ.
 * @returns {Promise<string[]>} шинээр хэрэгжүүлсэн файлын нэрс
 */
export async function migrate({ dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const files = await listMigrations(dir);
  const conn = await connect();
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 60) AS ok', [LOCK]);
    if (Number(lock.ok) !== 1) throw new Error('Өөр migration ажиллаж байна. Дараа дахин оролдоно уу.');
    await ensureTable(conn);
    await baselineLegacy(conn, files, log);
    const [rows] = await conn.query('SELECT version, name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.version, r]));
    for (const [version, r] of applied) {
      const f = files.find((x) => x.version === version);
      if (!f) throw new Error(`Хэрэгжсэн migration ${r.name} файл олдсонгүй.`);
      if (f.checksum !== r.checksum) {
        throw new Error(`Хэрэгжсэн migration ${f.name} өөрчлөгдсөн байна. Хуучныг засахгүй, шинэ migration нэмнэ үү.`);
      }
    }
    const done = [];
    for (const f of files) {
      if (applied.has(f.version)) continue;
      log(`→ ${f.name}`);
      // MySQL-д DDL автоматаар commit хийгддэг тул файл бүрийг жижиг, дахин ажиллуулахад аюулгүй байхаар бичнэ.
      await conn.query(f.sql);
      await conn.query('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)', [f.version, f.name, f.checksum]);
      done.push(f.name);
    }
    return done;
  } finally {
    try { await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]); } catch { /* ignore */ }
    await conn.end();
  }
}

/**
 * Сангийн БҮХ хүснэгтийг устгаад migration-уудыг дахин ажиллуулна.
 * Зөвхөн хөгжүүлэлт/тестийн орчинд — production-д татгалзана.
 */
export async function resetDatabase({ dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  if (config.isProd) throw new Error('db:reset нь production орчинд хориглогдсон (бүх өгөгдлийг устгана).');
  const conn = await connect();
  try {
    const [tables] = await conn.query(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [config.db.database],
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { t } of tables) await conn.query('DROP TABLE IF EXISTS ??', [t]);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    log(`${tables.length} хүснэгт устгалаа: ${config.db.database}`);
  } finally {
    await conn.end();
  }
  return migrate({ dir, log });
}
