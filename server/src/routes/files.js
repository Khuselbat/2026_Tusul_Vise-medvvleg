import { Router } from 'express';
import { one } from '../db.js';
import { wrap, notFound, forbidden, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { readFile } from '../lib/storage.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

/** Эрх шалгасан файлыг аюулгүй толгойтой буцаана. Вирусын шалгалтаас гараагүй файлыг хэн ч нээхгүй (Үе 3). */
async function sendFile(req, res, f, { entityType, applicationId }) {
  if (f.scan_status === 'PENDING')
    throw new HttpError(409, 'FILE_SCANNING', 'Файл вирусын шалгалтад байна. Түр хүлээгээд дахин оролдоно уу.');
  if (f.scan_status === 'REJECTED') throw new HttpError(410, 'FILE_REJECTED', 'Файл вирусын шалгалтад тэнцээгүй тул устгагдсан.');
  let buf;
  try {
    buf = await readFile(f.storage_key);
  } catch {
    throw notFound('Файл хадгалалтаас олдсонгүй. Дахин оролдоно уу.'); // UC-05 E2
  }
  await audit(req, {
    action: req.query.download ? 'FILE_DOWNLOAD' : 'FILE_VIEW',
    entityType,
    entityKey: f.id,
    applicationId,
  });
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set({
    'Content-Type': f.mime_type,
    'Content-Length': String(buf.length),
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Зөвхөн өөрийн хуудсанд iframe-ээр харуулна; зураг дээр скрипт ажиллахгүй
    'Content-Security-Policy':
      f.mime_type === 'application/pdf'
        ? "frame-ancestors 'self'"
        : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(buf);
}

async function deny(req, u, found, id, entityType) {
  await audit(req, { action: 'FILE_DENIED', entityType, entityKey: id, applicationId: null });
  if (u.role === 'APPLICANT' || !found) throw notFound('Файл олдсонгүй.');
  throw forbidden('Энэ файлыг үзэх эрхгүй байна.');
}

const idParam = (v) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Файл олдсонгүй.');
  return id;
};

/**
 * Нотолгоо файл (хүргүүлсэн баримт, албан үр дүн, импорт):
 *  - мэдүүлэгч: өөрийн мэдүүлэг эсвэл өөрийн импортын файл
 *  - оператор: өөрт хуваарилсан мэдүүлгийн HANDOVER / OFFICIAL_RESULT; импортыг ХЭЗЭЭ Ч үзэхгүй
 *  - админ: үзэхгүй
 */
r.get(
  '/evidence/:fileId',
  requireAuth,
  wrap(async (req, res) => {
    const id = idParam(req.params.fileId);
    const f = await one(
      `SELECT f.file_id AS id, f.kind, f.storage_key, f.mime_type, f.original_name, f.application_id, f.scan_status,
              a.applicant_id AS app_owner, a.assigned_operator_id, i.applicant_id AS import_owner
         FROM evidence_files f
         LEFT JOIN applications a ON a.application_id = f.application_id
         LEFT JOIN imported_applications i ON i.import_id = f.import_id
        WHERE f.file_id = ?`,
      [id],
    );
    const u = req.user;
    const allowed =
      f &&
      ((u.role === 'APPLICANT' && (f.app_owner === u.id || f.import_owner === u.id)) ||
        (u.role === 'OPERATOR' && f.kind !== 'IMPORT' && f.assigned_operator_id === u.id));
    if (!allowed) return deny(req, u, f, id, 'evidence_file');
    return sendFile(req, res, f, { entityType: 'evidence_file', applicationId: f.application_id });
  }),
);

/**
 * Хамгаалалттай файл үзэгч (NFR-01). Файл нээх, татах бүрд эрх шалгана:
 *  - мэдүүлэгч: зөвхөн өөрийн мэдүүлгийн файл
 *  - оператор: зөвхөн өөрт хуваарилсан мэдүүлгийн файл; нэмэлт багцаас зөвхөн илгээсэнийг
 *  - админ: админы эрх дангаараа файл үзэх эрх өгөхгүй
 */
r.get(
  '/:documentId',
  requireAuth,
  wrap(async (req, res) => {
    const id = idParam(req.params.documentId);
    const d = await one(
      `SELECT d.document_id AS id, d.storage_key, d.mime_type, d.original_name, d.scan_status,
              a.application_id, a.applicant_id, a.assigned_operator_id, a.status, s.status AS supplement_status
         FROM application_documents d JOIN applications a ON a.application_id = d.application_id
         LEFT JOIN application_supplements s ON s.supplement_id = d.supplement_id
        WHERE d.document_id = ?`,
      [id],
    );
    const u = req.user;
    const allowed =
      d &&
      ((u.role === 'APPLICANT' && d.applicant_id === u.id) ||
        (u.role === 'OPERATOR' &&
          d.assigned_operator_id === u.id &&
          d.status !== 'DRAFT' &&
          (d.supplement_status === null || d.supplement_status === 'SUBMITTED')));
    if (!allowed) return deny(req, u, d, id, 'document');
    return sendFile(req, res, d, { entityType: 'document', applicationId: d.application_id });
  }),
);

export default r;
