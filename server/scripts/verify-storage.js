// NFR-04/05 шалгалт: өгөгдлийн сан дахь хавсралт бүрийн файл хадгалалтад байгаа эсэх,
// SHA-256 хяналтын нийлбэр таарч байгаа эсэхийг тулгана. Нөөцөөс сэргээсний дараа ажиллуулна.
import crypto from 'node:crypto';
import { pool, query } from '../src/db.js';
import { readFile } from '../src/lib/storage.js';

const rows = await query('SELECT document_id, storage_key, sha256, size_bytes FROM application_documents');
let ok = 0;
const bad = [];
for (const r of rows) {
  try {
    const buf = await readFile(r.storage_key);
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (sum === r.sha256 && buf.length === Number(r.size_bytes)) ok += 1;
    else bad.push({ id: r.document_id, reason: 'checksum/size mismatch' });
  } catch {
    bad.push({ id: r.document_id, reason: 'file missing' });
  }
}
const apps = await query(`SELECT COUNT(*) AS n FROM applications a WHERE a.status <> 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM application_forms f WHERE f.application_id = a.application_id)`);
console.log(`Хавсралт: ${ok}/${rows.length} таарсан (${rows.length ? ((ok / rows.length) * 100).toFixed(1) : '100.0'}%)`);
console.log(`Анкетгүй илгээсэн мэдүүлэг: ${apps[0].n}`);
if (bad.length) console.log('Зөрүү:', bad);
await pool.end();
process.exit(bad.length || Number(apps[0].n) ? 1 : 0);
