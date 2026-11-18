// Мэдүүлэгчийн профайл, бичиг баримтын сан, ноорогт автоматаар бөглөх (зөвхөн эзэмшигч — NFR-01).
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db.js';
import { wrap, parse, badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { receiveFiles, storeFiles, discardFiles } from '../lib/uploads.js';
import { removeFile } from '../lib/storage.js';
import { kickScanner, initialScanStatus } from '../lib/scanner.js';
import { isoDate } from '../lib/applications.js';
import {
  profileSchema,
  saveProfile,
  loadProfile,
  serializeProfile,
  profileToForm,
  listProfileDocs,
  serializeProfileDoc,
  profileWarnings,
  documentTypes,
  autofillDraftDocuments,
  EXPIRY_WARN_DAYS,
} from '../lib/profile.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('APPLICANT'));

/** Профайлын баримтын сангийн хязгаар (нэг хэрэглэгчид) */
const VAULT_MAX_FILES = 50;
const VAULT_MAX_BYTES = config.limits.totalBytes; // 100 MB

const typeList = async () => (await documentTypes()).map((t) => ({ code: t.code, name: t.name_mn, hasExpiry: !!t.has_expiry }));

r.get(
  '/profile',
  wrap(async (req, res) => {
    const row = await loadProfile(req.user.id);
    const docs = await listProfileDocs(req.user.id);
    res.json({
      profile: serializeProfile(row),
      documents: docs.map(serializeProfileDoc),
      warnings: profileWarnings(row, docs),
      documentTypes: await typeList(),
      warnDays: EXPIRY_WARN_DAYS,
      accountEmail: req.user.email,
    });
  }),
);

r.put(
  '/profile',
  wrap(async (req, res) => {
    const data = parse(profileSchema, req.body);
    await tx(async (q) => {
      await saveProfile(q, req.user.id, data);
      // Агуулгыг audit-д бичихгүй (дүрэм 3)
      await audit(req, { action: 'PROFILE_UPDATE', entityType: 'user', entityKey: req.user.id }, q);
    });
    res.json({ profile: serializeProfile(await loadProfile(req.user.id)) });
  }),
);

/** Шинэ мэдүүлгийн анкетад санал болгох утгууд (паспорт бүтнээр — зөвхөн эзэмшигчид) */
r.get(
  '/profile/prefill',
  wrap(async (req, res) => {
    res.json(profileToForm(await loadProfile(req.user.id), req.user.email));
  }),
);

/* ───────────── Бичиг баримтын сан ───────────── */

const optDate = z.union([z.literal(''), z.null(), isoDate('Бодит огноо оруулна уу.')]).optional();
const docMeta = z
  .object({
    typeCode: z.string().trim().min(1, 'Баримтын төрлөө сонгоно уу.').max(40),
    title: z.string().trim().max(200).optional().default(''),
    issuedOn: optDate,
    validUntil: optDate,
  })
  .superRefine((d, ctx) => {
    if (d.issuedOn && d.validUntil && d.validUntil < d.issuedOn)
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Хүчинтэй хугацаа олгосон огнооноос хойш байна.' });
  });

async function checkType(code) {
  if (!(await one('SELECT 1 AS ok FROM document_types WHERE code = ? AND is_active = 1', [code])))
    throw badRequest('Баримтын төрөл буруу байна.', { fields: { typeCode: 'Баримтын төрлөө сонгоно уу.' } });
}

async function ownDoc(req) {
  const d = await one('SELECT * FROM profile_documents WHERE document_id = ? AND user_id = ?', [Number(req.params.docId), req.user.id]);
  if (!d) throw notFound('Баримт олдсонгүй.');
  return d;
}

r.post(
  '/profile/documents',
  receiveFiles(),
  wrap(async (req, res) => {
    const meta = parse(docMeta, req.body || {});
    await checkType(meta.typeCode);
    if (!req.file) throw badRequest('Файл сонгоно уу.');
    const usage = await one('SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS total FROM profile_documents WHERE user_id = ?', [
      req.user.id,
    ]);
    if (Number(usage.n) >= VAULT_MAX_FILES) throw badRequest(`Баримтын санд хамгийн ихдээ ${VAULT_MAX_FILES} файл хадгална.`);
    if (Number(usage.total) + req.file.size > VAULT_MAX_BYTES) throw badRequest('Баримтын сангийн нийт хэмжээ 100 MB-аас хэтэрнэ.');
    const [s] = await storeFiles([req.file]); // magic byte шалгалт + хадгалах (шифрлэлт storage.js-д)
    try {
      const doc = await tx(async (q) => {
        const ins = await q(
          `INSERT INTO profile_documents (user_id, type_code, title, original_name, storage_key, mime_type, size_bytes, sha256, scan_status,
                                          issued_on, valid_until)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            req.user.id,
            meta.typeCode,
            meta.title || null,
            s.originalName,
            s.storageKey,
            s.mime,
            s.size,
            s.sha256,
            initialScanStatus(),
            meta.issuedOn || null,
            meta.validUntil || null,
          ],
        );
        await audit(req, { action: 'PROFILE_DOC_UPLOAD', entityType: 'profile_document', entityKey: ins.insertId }, q);
        return (
          await q(
            'SELECT d.*, t.name_mn AS type_name FROM profile_documents d JOIN document_types t ON t.code = d.type_code WHERE d.document_id = ?',
            [ins.insertId],
          )
        )[0];
      });
      kickScanner();
      res.status(201).json({ document: serializeProfileDoc(doc) });
    } catch (e) {
      await discardFiles([s]);
      throw e;
    }
  }),
);

r.put(
  '/profile/documents/:docId',
  wrap(async (req, res) => {
    const d = await ownDoc(req);
    const meta = parse(docMeta, req.body || {});
    await checkType(meta.typeCode);
    await tx(async (q) => {
      await q('UPDATE profile_documents SET type_code = ?, title = ?, issued_on = ?, valid_until = ? WHERE document_id = ?', [
        meta.typeCode,
        meta.title || null,
        meta.issuedOn || null,
        meta.validUntil || null,
        d.document_id,
      ]);
      await audit(req, { action: 'PROFILE_DOC_UPDATE', entityType: 'profile_document', entityKey: d.document_id }, q);
    });
    const row = await one(
      'SELECT d.*, t.name_mn AS type_name FROM profile_documents d JOIN document_types t ON t.code = d.type_code WHERE d.document_id = ?',
      [d.document_id],
    );
    res.json({ document: serializeProfileDoc(row) });
  }),
);

/** Устгахад мэдүүлэгт хуулсан хувилбарууд (өөр storage_key) хэвээр үлдэнэ */
r.delete(
  '/profile/documents/:docId',
  wrap(async (req, res) => {
    const d = await ownDoc(req);
    await tx(async (q) => {
      await q('DELETE FROM profile_documents WHERE document_id = ?', [d.document_id]);
      await audit(req, { action: 'PROFILE_DOC_DELETE', entityType: 'profile_document', entityKey: d.document_id }, q);
    });
    await removeFile(d.storage_key).catch(() => {});
    res.json({ ok: true });
  }),
);

/* ───────────── Ноорогт автоматаар хавсаргах ───────────── */

r.post(
  '/drafts/:id/autofill-documents',
  wrap(async (req, res) => {
    const draft = await one("SELECT * FROM applications WHERE public_id = ? AND applicant_id = ? AND status = 'DRAFT'", [
      req.params.id,
      req.user.id,
    ]);
    if (!draft) throw notFound('Ноорог олдсонгүй.');
    res.json(await autofillDraftDocuments(req, draft));
  }),
);

/** Ноорогт хамаарах шаардлага бүрийн баримтын төрөл (UI-д “профайлаас хавсаргах боломжтой” гэж харуулах) */
r.get(
  '/drafts/:id/document-matches',
  wrap(async (req, res) => {
    const draft = await one(
      "SELECT application_id, version_id FROM applications WHERE public_id = ? AND applicant_id = ? AND status = 'DRAFT'",
      [req.params.id, req.user.id],
    );
    if (!draft) throw notFound('Ноорог олдсонгүй.');
    const rows = await query(
      `SELECT m.requirement_id, m.type_code FROM requirement_document_types m
         JOIN visa_requirements r ON r.requirement_id = m.requirement_id WHERE r.version_id = ?`,
      [draft.version_id],
    );
    const map = {};
    for (const x of rows) (map[x.requirement_id] ||= []).push(x.type_code);
    res.json({ requirementTypes: map });
  }),
);

export default r;
