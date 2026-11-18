// Үе 3 — хадгалах хугацааны цэвэрлэгээ (тайлан 4.5: “архивлах нь хугацаагүй хадгалалт биш”).
// Автоматаар устгах: хугацаа хэтэрсэн НООРОГ (файлтай нь), өнчин файл (DB-д бичлэггүй), хуучин токен/сесс,
// уншсан хуучин мэдэгдэл. ИЛГЭЭСЭН мэдүүлгийн архивыг автоматаар устгахгүй — устгах хүсэлтээр (D-33).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query, tx, withLock } from '../db.js';
import { audit } from './audit.js';
import { logger } from './logger.js';
import { listStoredFiles, removeFile } from './storage.js';

const sysReq = () => ({ id: crypto.randomUUID(), user: null });

/**
 * Үе 5: олон инстанс (эсвэл сервер + cron скрипт) зэрэг ажиллуулахад нэг л удаа гүйцэтгэнэ.
 * Өөр процесс ажиллаж байвал `{ skipped: true }` буцаана.
 */
export async function runRetention(opts = {}) {
  const r = await withLock('civiz_retention', () => retentionPass(opts));
  return r.acquired ? r.result : { skipped: true };
}

async function retentionPass({ now = new Date(), dryRun = false } = {}) {
  const r = config.retention;
  const out = { drafts: 0, orphanFiles: 0, tokens: 0, sessions: 0, notifications: 0 };

  // 1. Хугацаа хэтэрсэн ноорог + түр файл
  const drafts = await query(
    "SELECT application_id, public_id FROM applications WHERE status = 'DRAFT' AND created_at < ? - INTERVAL ? DAY",
    [now, r.draftDays],
  );
  for (const d of drafts) {
    const docs = await query('SELECT storage_key FROM application_documents WHERE application_id = ?', [d.application_id]);
    if (!dryRun) {
      await tx(async (q) => {
        await q("DELETE FROM applications WHERE application_id = ? AND status = 'DRAFT'", [d.application_id]);
      });
      await Promise.all(docs.map((x) => removeFile(x.storage_key).catch(() => {})));
    }
    out.drafts += 1;
  }

  // 2. Өнчин файл: санд бичлэггүй (тасарсан upload, бүтэлгүй транзакц) — хэсэг хугацааны дараа
  const known = new Set(
    (await query('SELECT storage_key FROM application_documents UNION ALL SELECT storage_key FROM evidence_files')).map(
      (x) => x.storage_key,
    ),
  );
  const cutoff = now.getTime() - r.orphanFileHours * 3600 * 1000;
  for await (const f of listStoredFiles()) {
    if (known.has(f.key) || new Date(f.modifiedAt).getTime() > cutoff) continue;
    if (!dryRun) await removeFile(f.key);
    out.orphanFiles += 1;
  }

  // 3–5. Хуучин токен, сесс, уншсан мэдэгдэл
  if (!dryRun) {
    out.tokens = (
      await query('DELETE FROM user_tokens WHERE (used_at IS NOT NULL OR expires_at < ?) AND created_at < ? - INTERVAL ? DAY', [
        now,
        now,
        r.tokenDays,
      ])
    ).affectedRows;
    out.sessions = (
      await query('DELETE FROM user_sessions WHERE (revoked_at IS NOT NULL OR expires_at < ?) AND created_at < ? - INTERVAL ? DAY', [
        now,
        now,
        r.sessionDays,
      ])
    ).affectedRows;
    out.notifications = (
      await query("DELETE FROM notifications WHERE read_at IS NOT NULL AND email_status <> 'PENDING' AND created_at < ? - INTERVAL ? DAY", [
        now,
        r.notificationDays,
      ])
    ).affectedRows;
    await audit(sysReq(), {
      action: 'RETENTION_RUN',
      entityType: 'system',
      entityKey: `d${out.drafts} f${out.orphanFiles} t${out.tokens} s${out.sessions} n${out.notifications}`,
      actorId: null,
    });
  }
  return out;
}

export function startRetentionWorker() {
  if (config.isTest) return null;
  const run = () =>
    runRetention()
      .then((out) => logger.info(out, 'retention run'))
      .catch((err) => logger.error({ err }, 'retention failed'));
  setTimeout(run, 60 * 1000).unref(); // эхлэхэд 1 минутын дараа
  const t = setInterval(run, config.retention.runEveryHours * 3600 * 1000);
  t.unref();
  return t;
}
