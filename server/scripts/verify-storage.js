// NFR-04/05 шалгалт: сан дахь хавсралт, нотолгоо файл бүр хадгалалтад байгаа эсэх, SHA-256 таарах эсэхийг
// (шифрлэгдсэн бол тайлж) тулгана. Нөөцөөс сэргээсний дараа, түлхүүр эргүүлсний дараа ажиллуулна.
import crypto from 'node:crypto';
import { pool, query } from '../src/db.js';
import { readFile } from '../src/lib/storage.js';

// Вирусын шалгалтад тэнцээгүй (REJECTED) файл хадгалалтаас санаатайгаар устгагдсан тул тооцохгүй
const rows = [
  ...(await query(
    "SELECT document_id AS id, 'document' AS kind, storage_key, sha256, size_bytes FROM application_documents WHERE scan_status <> 'REJECTED'",
  )),
  ...(await query(
    "SELECT file_id AS id, 'evidence' AS kind, storage_key, sha256, size_bytes FROM evidence_files WHERE scan_status <> 'REJECTED'",
  )),
];
let ok = 0;
const bad = [];
for (const r of rows) {
  try {
    const buf = await readFile(r.storage_key);
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (sum === r.sha256 && buf.length === Number(r.size_bytes)) ok += 1;
    else bad.push({ kind: r.kind, id: r.id, reason: 'checksum/size mismatch' });
  } catch (e) {
    bad.push({ kind: r.kind, id: r.id, reason: e.code === 'ENOENT' || e.name === 'NoSuchKey' ? 'file missing' : 'unreadable (түлхүүр?)' });
  }
}
// Устгах хүсэлтээр нэргүй болсон хэрэглэгчийн мэдүүлэг анкетгүй байх нь хэвийн
const apps = await query(`SELECT COUNT(*) AS n FROM applications a JOIN users u ON u.user_id = a.applicant_id
  WHERE a.status <> 'DRAFT' AND u.email NOT LIKE 'deleted-%@deleted.invalid'
    AND NOT EXISTS (SELECT 1 FROM application_forms f WHERE f.application_id = a.application_id)`);
console.log(`Файл: ${ok}/${rows.length} таарсан (${rows.length ? ((ok / rows.length) * 100).toFixed(1) : '100.0'}%)`);
console.log(`Анкетгүй илгээсэн мэдүүлэг: ${apps[0].n}`);
if (bad.length) console.log('Зөрүү:', bad);
await pool.end();
process.exit(bad.length || Number(apps[0].n) ? 1 : 0);
