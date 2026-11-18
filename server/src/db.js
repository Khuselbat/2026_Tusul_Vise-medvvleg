import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  waitForConnections: true,
  charset: 'utf8mb4',
  dateStrings: ['DATE'],
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: false,
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Үе 5: олон инстанс (2+ app контейнер) зэрэг ажиллахад ар талын ажлыг (имэйл outbox, вирус шалгалт, хадгалах хугацаа)
 * зөвхөн нэг нь гүйцэтгэнэ. MySQL/MariaDB-ийн нэрлэсэн түгжээ (GET_LOCK) холболттой холбоотой тул процесс унавал
 * автоматаар чөлөөлөгдөнө. Түгжээ эзэлсэн бол хүлээхгүй — `{ acquired: false }` буцаана.
 */
export async function withLock(name, fn) {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [name]);
    if (Number(row.ok) !== 1) return { acquired: false };
    try {
      return { acquired: true, result: await fn() };
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [name]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

/** Транзакц: алдаа гарвал бүх өөрчлөлтийг буцаана (UC-04 E4). */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const result = await fn(q, conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}
