// Үе 3 — мэдүүлэгчийн бүртгэл устгах (админ баталгаажуулсан хүсэлтээр, тайлан 4.5).
// Хувийн мэдээлэл (анкет, паспорт, бүх файл, импорт, албан үр дүн, мэдэгдэл, сесс) бүрэн устна.
// Илгээсэн мэдүүлгийн мөр (лавлах дугаар, төлөв, огноо) нэргүйгээр статистик, үнэлгээний бүрэн байдалд үлдэнэ.
// Үнэлгээний тайлбарыг хувийн мэдээлэл агуулж болох тул арилгана — reviews-ийг өөрчлөх ЦОРЫН ГАНЦ онцгой тохиолдол (D-35).
import crypto from 'node:crypto';
import { hashPassword } from './password.js';

export const ACTIVE_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'INCOMPLETE'];
export const REDACTED = '[хувийн мэдээллийн устгалаар арилгасан]';

/** Идэвхтэй хянагдаж буй мэдүүлгийн тоо (устгахыг хориглоно). */
export async function activeApplicationCount(q, userId) {
  const r = await q(`SELECT COUNT(*) AS n FROM applications WHERE applicant_id = ? AND status IN (?)`, [userId, ACTIVE_STATUSES]);
  return Number(r[0].n);
}

/**
 * Транзакц дотор (`q`) устгана. Хадгалалтаас устгах storage_key-уудыг буцаана (commit-ийн дараа устгана).
 */
export async function eraseApplicant(q, userId) {
  const apps = (await q('SELECT application_id, status FROM applications WHERE applicant_id = ? FOR UPDATE', [userId])).map((a) => a);
  const appIds = apps.map((a) => a.application_id);
  const imports = (await q('SELECT import_id FROM imported_applications WHERE applicant_id = ?', [userId])).map((x) => x.import_id);
  const keys = [];
  const IN = (ids) => (ids.length ? ids : [0]);

  keys.push(
    ...(await q('SELECT storage_key FROM application_documents WHERE application_id IN (?)', [IN(appIds)])).map((x) => x.storage_key),
  );
  keys.push(
    ...(await q('SELECT storage_key FROM evidence_files WHERE application_id IN (?) OR import_id IN (?)', [IN(appIds), IN(imports)])).map(
      (x) => x.storage_key,
    ),
  );

  // Албан үр дүн, хүргүүлсэн, нотолгоо, импорт
  await q(
    'DELETE v FROM official_result_verifications v JOIN official_results r ON r.result_id = v.result_id WHERE r.application_id IN (?)',
    [IN(appIds)],
  );
  await q('DELETE FROM official_results WHERE application_id IN (?)', [IN(appIds)]);
  await q('DELETE FROM application_handovers WHERE application_id IN (?)', [IN(appIds)]);
  await q('DELETE FROM evidence_files WHERE application_id IN (?) OR import_id IN (?)', [IN(appIds), IN(imports)]);
  await q('DELETE FROM imported_applications WHERE applicant_id = ?', [userId]);

  // Анкет, хавсралт, нэмэлт багц
  await q('DELETE FROM application_documents WHERE application_id IN (?)', [IN(appIds)]);
  await q('DELETE FROM application_supplements WHERE application_id IN (?)', [IN(appIds)]);
  await q('DELETE FROM application_forms WHERE application_id IN (?)', [IN(appIds)]);
  await q('UPDATE reviews SET comment = ? WHERE application_id IN (?) AND comment IS NOT NULL', [REDACTED, IN(appIds)]);
  await q('DELETE FROM notifications WHERE user_id = ? OR application_id IN (?)', [userId, IN(appIds)]);
  await q("DELETE FROM applications WHERE applicant_id = ? AND status = 'DRAFT'", [userId]);

  // Нэвтрэлт ба хэрэглэгчийн мөрийг нэргүй болгох (FK-ийн бүрэн байдлын тулд мөр үлдэнэ)
  await q('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
  await q('DELETE FROM user_tokens WHERE user_id = ?', [userId]);
  await q('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
  await q('UPDATE account_deletion_requests SET reason = NULL WHERE user_id = ?', [userId]);
  const unusable = await hashPassword(crypto.randomBytes(32).toString('hex'), 4);
  await q(
    `UPDATE users SET public_id = ?, email = ?, display_name = ?, password_hash = ?, is_active = 0, email_verified_at = NULL,
            mfa_secret_enc = NULL, mfa_key_id = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL WHERE user_id = ?`,
    [crypto.randomUUID(), `deleted-${userId}@deleted.invalid`, 'Устгагдсан хэрэглэгч', unusable, userId],
  );
  return { storageKeys: keys, applications: apps.length, imports: imports.length };
}
