import { Router } from 'express';
import { one } from '../db.js';
import { wrap, notFound, forbidden } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { readFile } from '../lib/storage.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

/**
 * Хамгаалалттай файл үзэгч (NFR-01). Файл нээх, татах бүрд эрх шалгана:
 *  - мэдүүлэгч: зөвхөн өөрийн мэдүүлгийн файл
 *  - оператор: зөвхөн өөрт хуваарилсан мэдүүлгийн файл
 *  - админ: админы эрх дангаараа файл үзэх эрх өгөхгүй
 */
r.get('/:documentId', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.documentId);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Файл олдсонгүй.');
  const d = await one(
    `SELECT d.document_id, d.storage_key, d.mime_type, d.original_name, d.size_bytes, d.sha256,
            a.application_id, a.applicant_id, a.assigned_operator_id, a.status
       FROM application_documents d JOIN applications a ON a.application_id = d.application_id
      WHERE d.document_id = ?`,
    [id],
  );
  const u = req.user;
  const allowed = d && (
    (u.role === 'APPLICANT' && d.applicant_id === u.id)
    || (u.role === 'OPERATOR' && d.assigned_operator_id === u.id && d.status !== 'DRAFT')
  );
  if (!allowed) {
    await audit(req, { action: 'FILE_DENIED', entityType: 'document', entityKey: id, applicationId: null });
    if (u.role === 'APPLICANT' || !d) throw notFound('Файл олдсонгүй.');
    throw forbidden('Энэ файлыг үзэх эрхгүй байна.');
  }
  let buf;
  try { buf = await readFile(d.storage_key); } catch { throw notFound('Файл хадгалалтаас олдсонгүй. Дахин оролдоно уу.'); }
  await audit(req, { action: req.query.download ? 'FILE_DOWNLOAD' : 'FILE_VIEW', entityType: 'document', entityKey: d.document_id, applicationId: d.application_id });
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set({
    'Content-Type': d.mime_type,
    'Content-Length': String(buf.length),
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(d.original_name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Зөвхөн өөрийн хуудсанд iframe-ээр харуулна; зураг дээр скрипт ажиллахгүй
    'Content-Security-Policy': d.mime_type === 'application/pdf'
      ? "frame-ancestors 'self'"
      : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(buf);
}));

export default r;
