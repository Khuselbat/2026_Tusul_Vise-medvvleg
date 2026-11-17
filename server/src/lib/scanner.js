// Үе 3 — вирус шалгалт (ClamAV clamd, INSTREAM протокол). CLAMAV_HOST тохируулсан үед шинэ файл PENDING төлөвтэй
// хадгалагдаж, ар талын ажил ACCEPTED/REJECTED болгоно. Шалгагдаагүй/татгалзсан файлыг хэн ч нээхгүй.
// ClamAV-гүй орчинд (dev) magic byte шалгалт л хийж шууд ACCEPTED (одоогийн зан төлөв).
import net from 'node:net';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';
import { audit } from './audit.js';
import { logger } from './logger.js';
import { readFile, removeFile } from './storage.js';

export const scannerEnabled = () => !!config.clamav.host;
/** Шинэ файлын анхны төлөв */
export const initialScanStatus = () => (scannerEnabled() ? 'PENDING' : 'ACCEPTED');

const CHUNK = 64 * 1024;

/** clamd INSTREAM: { clean, signature } буцаана; холболтын алдаа бол шиднэ. */
export function scanBuffer(buf, { host = config.clamav.host, port = config.clamav.port, timeoutMs = config.clamav.timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let reply = '';
    const done = (fn) => {
      sock.destroy();
      fn();
    };
    sock.setTimeout(timeoutMs, () => done(() => reject(new Error('clamd timeout'))));
    sock.on('error', (e) => done(() => reject(e)));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += CHUNK) {
        const part = buf.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        sock.write(len);
        sock.write(part);
      }
      sock.write(Buffer.alloc(4)); // төгсгөл
    });
    sock.on('data', (d) => {
      reply += d.toString('utf8');
    });
    sock.on('end', () => {
      const r = reply.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(r)) resolve({ clean: true });
      else if (/FOUND$/.test(r))
        resolve({
          clean: false,
          signature: r
            .replace(/^.*?:\s*/, '')
            .replace(/\s*FOUND$/, '')
            .slice(0, 120),
        });
      else reject(new Error(`clamd unexpected reply: ${r.slice(0, 120)}`));
    });
  });
}

const sysReq = () => ({ id: crypto.randomUUID(), user: null });

const TABLES = [
  { table: 'application_documents', id: 'document_id', entity: 'document' },
  { table: 'evidence_files', id: 'file_id', entity: 'evidence_file' },
];

let running = false;
/** PENDING файлуудыг шалгана. Холболтын алдаа гарвал PENDING хэвээр үлдэж дараа дахин оролдоно. */
export async function processPendingScans({ limit = 20 } = {}) {
  if (!scannerEnabled() || running) return { accepted: 0, rejected: 0 };
  running = true;
  const out = { accepted: 0, rejected: 0 };
  try {
    for (const t of TABLES) {
      const rows = await query(
        `SELECT ${t.id} AS id, storage_key, application_id FROM ${t.table} WHERE scan_status = 'PENDING' ORDER BY ${t.id} LIMIT ?`,
        [limit],
      );
      for (const row of rows) {
        let result;
        try {
          result = await scanBuffer(await readFile(row.storage_key));
        } catch (err) {
          logger.warn({ err, [t.id]: row.id }, 'virus scan deferred');
          return out; // clamd хүрэхгүй бол дараагийн удаа
        }
        if (result.clean) {
          await query(`UPDATE ${t.table} SET scan_status = 'ACCEPTED', scanned_at = CURRENT_TIMESTAMP(6) WHERE ${t.id} = ?`, [row.id]);
          out.accepted += 1;
        } else {
          await query(`UPDATE ${t.table} SET scan_status = 'REJECTED', scanned_at = CURRENT_TIMESTAMP(6) WHERE ${t.id} = ?`, [row.id]);
          await removeFile(row.storage_key); // халдвартай агуулгыг хадгалахгүй
          await audit(sysReq(), {
            action: 'FILE_REJECTED',
            entityType: t.entity,
            entityKey: row.id,
            applicationId: row.application_id ?? null,
            actorId: null,
          });
          logger.warn({ [t.id]: row.id, signature: result.signature }, 'infected file rejected');
          out.rejected += 1;
        }
      }
    }
  } finally {
    running = false;
  }
  return out;
}

export function kickScanner() {
  if (config.isTest || !scannerEnabled()) return;
  // Транзакц commit болохыг хүлээж бага зэрэг хоцроно (worker ч 30 сек тутам шалгана)
  setTimeout(() => processPendingScans().catch((err) => logger.error({ err }, 'scan failed')), 300).unref();
}

export function startScanWorker(intervalMs = 30000) {
  if (config.isTest || !scannerEnabled()) return null;
  const t = setInterval(() => processPendingScans().catch((err) => logger.error({ err }, 'scan worker failed')), intervalMs);
  t.unref();
  return t;
}
