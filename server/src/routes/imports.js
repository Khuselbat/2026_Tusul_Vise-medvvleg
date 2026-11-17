// Үе 1.3 — Өмнөх мэдүүлэг импортлох (тайлан 4.5 “Өмнөх мэдүүлэг нэмэх”).
// Мэдүүлэгч системээс гадуур өгсөн мэдүүлгээ өөрийн баримтын хамт нэмнэ — “импортолсон, баталгаажаагүй”.
// Зөвхөн эзэмшигч харна (бусдынх 404); оператор, админд харагдахгүй, хяналтад орохгүй.
// Засахгүй (архивын зарчим); өөрийн баталгаажаагүй бичлэгийг устгаж болно (D-13).
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { wrap, parse, badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { makeReference } from '../lib/crypto.js';
import { removeFile } from '../lib/storage.js';
import { serializeEvidence, OUTCOME_LABEL } from '../lib/applications.js';
import { receiveFiles, storeFiles, discardFiles, insertEvidence } from '../lib/uploads.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('APPLICANT'));

const MAX_FILES = 10;
const today = () => new Date().toISOString().slice(0, 10);
const optText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => s || null);

const importSchema = z.object({
  countryName: z.string().trim().min(2, 'Улсын нэр оруулна уу.').max(100),
  visaCategory: z.string().trim().min(1, 'Визийн ангилал оруулна уу (ж: C-3-9).').max(60),
  appliedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу байна.')
    .refine((d) => d <= today(), 'Мэдүүлсэн огноо ирээдүйд байж болохгүй.')
    .refine((d) => d >= '1990-01-01', 'Огноо буруу байна.'),
  authority: optText(150),
  officialRef: optText(64),
  outcome: z.enum(['NOT_CHECKED', 'PENDING', 'APPROVED', 'REFUSED']).default('NOT_CHECKED'),
  note: optText(4000),
  idempotencyKey: z.string().uuid('Хүсэлтийн түлхүүр буруу.'),
});

const serializeImport = (x) => ({
  publicId: x.public_id,
  countryName: x.country_name,
  visaCategory: x.visa_category,
  appliedOn: x.applied_on,
  authority: x.authority,
  officialRef: x.official_ref,
  outcome: x.outcome,
  outcomeLabel: OUTCOME_LABEL[x.outcome],
  note: x.note,
  createdAt: x.created_at,
  imported: true,
  verified: false,
});

r.get(
  '/imports',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT i.*, (SELECT COUNT(*) FROM evidence_files f WHERE f.import_id = i.import_id) AS file_count
         FROM imported_applications i WHERE i.applicant_id = ? ORDER BY i.applied_on DESC, i.import_id DESC`,
      [req.user.id],
    );
    res.json({ items: rows.map((x) => ({ ...serializeImport(x), fileCount: Number(x.file_count) })) });
  }),
);

r.post(
  '/imports',
  receiveFiles({ field: 'files', maxFiles: MAX_FILES }),
  wrap(async (req, res) => {
    const data = parse(importSchema, req.body);
    const files = req.files || [];
    if (files.reduce((s, f) => s + f.size, 0) > config.limits.totalBytes) throw badRequest('Нийт файлын хэмжээ 100 MB-аас хэтэрнэ.');
    const stored = await storeFiles(files);
    let out;
    try {
      out = await tx(async (q) => {
        const dup = (
          await q('SELECT public_id FROM imported_applications WHERE applicant_id = ? AND idempotency_key = ?', [
            req.user.id,
            data.idempotencyKey,
          ])
        )[0];
        if (dup) return { publicId: dup.public_id, repeated: true };
        const publicId = makeReference('IMP');
        const ins = await q(
          `INSERT INTO imported_applications (public_id, applicant_id, idempotency_key, country_name, visa_category, applied_on, authority, official_ref, outcome, note)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            publicId,
            req.user.id,
            data.idempotencyKey,
            data.countryName,
            data.visaCategory,
            data.appliedOn,
            data.authority,
            data.officialRef,
            data.outcome,
            data.note,
          ],
        );
        for (const file of stored) await insertEvidence(q, { kind: 'IMPORT', importId: ins.insertId, uploadedBy: req.user.id, file });
        await audit(req, { action: 'IMPORT_CREATE', entityType: 'imported_application', entityKey: publicId }, q);
        return { publicId, repeated: false };
      });
    } catch (e) {
      await discardFiles(stored);
      throw e;
    }
    if (out.repeated) await discardFiles(stored);
    res.status(out.repeated ? 200 : 201).json({ publicId: out.publicId });
  }),
);

async function ownImport(req, q = query, lock = false) {
  const rows = await q(`SELECT * FROM imported_applications WHERE public_id = ? AND applicant_id = ? ${lock ? 'FOR UPDATE' : ''}`, [
    req.params.id,
    req.user.id,
  ]);
  if (!rows[0]) throw notFound('Бичлэг олдсонгүй.');
  return rows[0];
}

r.get(
  '/imports/:id',
  wrap(async (req, res) => {
    const x = await ownImport(req);
    const files = await query('SELECT * FROM evidence_files WHERE import_id = ? ORDER BY file_id', [x.import_id]);
    await audit(req, { action: 'IMPORT_VIEW', entityType: 'imported_application', entityKey: x.public_id });
    res.json({ item: { ...serializeImport(x), files: files.map(serializeEvidence) } });
  }),
);

r.delete(
  '/imports/:id',
  wrap(async (req, res) => {
    const keys = await tx(async (q) => {
      const x = await ownImport(req, q, true);
      const files = await q('SELECT storage_key FROM evidence_files WHERE import_id = ?', [x.import_id]);
      await q('DELETE FROM evidence_files WHERE import_id = ?', [x.import_id]);
      await q('DELETE FROM imported_applications WHERE import_id = ?', [x.import_id]);
      await audit(req, { action: 'IMPORT_DELETE', entityType: 'imported_application', entityKey: x.public_id }, q);
      return files.map((f) => f.storage_key);
    });
    await Promise.all(keys.map((k) => removeFile(k)));
    res.json({ ok: true });
  }),
);

export default r;
