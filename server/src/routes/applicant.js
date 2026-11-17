import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db.js';
import { wrap, parse, badRequest, notFound, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { initialScanStatus, kickScanner } from '../lib/scanner.js';
import { notify, kickMailer } from '../lib/notify.js';
import { encryptPassport, makeReference } from '../lib/crypto.js';
import { detectType, saveFile, removeFile, safeFileName } from '../lib/storage.js';
import { LATEST_PUBLISHED, canApply, applyBlockReason, STATUS_LABEL } from '../lib/visa.js';
import { formSchema, parseForm, serializeForm, serializeDoc, loadApplicationDetail, APP_SELECT } from '../lib/applications.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('APPLICANT'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.fileBytes, files: 1, fields: 5 },
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(badRequest('Файлын хэмжээ 10 MB-аас их байна.'));
    return next(badRequest('Файл хүлээн авахад алдаа гарлаа. Дахин оролдоно уу.'));
  });
}

/** Эзэмшигчийн ноорог (BR-02). Өөр хүнийх бол 404 — оршин байгааг илчлэхгүй. */
async function ownDraft(req, q = query) {
  const rows = await q(
    `SELECT a.*, v.version_no, v.published_at, t.is_active AS type_active, c.iso_code, c.service_status,
            ${LATEST_PUBLISHED} AS latest_no
       FROM applications a
       JOIN visa_info_versions v ON v.version_id = a.version_id
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id
       JOIN countries c ON c.country_id = t.country_id
      WHERE a.public_id = ? AND a.applicant_id = ? AND a.status = 'DRAFT'`,
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw notFound('Ноорог олдсонгүй.');
  return rows[0];
}

// Зураг 42 Хянах самбар — зөвхөн өөрийн мэдүүлэг ба хамгийн сүүлийн үнэлгээ
r.get(
  '/dashboard',
  wrap(async (req, res) => {
    const counts = await query('SELECT status, COUNT(*) AS n FROM applications WHERE applicant_id = ? GROUP BY status', [req.user.id]);
    const recent = await query(`${APP_SELECT} WHERE a.applicant_id = ? AND a.status <> 'DRAFT' ORDER BY a.submitted_at DESC LIMIT 5`, [
      req.user.id,
    ]);
    const drafts = await query(`${APP_SELECT} WHERE a.applicant_id = ? AND a.status = 'DRAFT' ORDER BY a.created_at DESC LIMIT 5`, [
      req.user.id,
    ]);
    const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
    const row = (a) => ({
      publicId: a.public_id,
      status: a.status,
      statusLabel: STATUS_LABEL[a.status],
      visaName: a.name_mn,
      visaCode: a.code,
      country: a.country_name,
      submittedAt: a.submitted_at,
      createdAt: a.created_at,
    });
    res.json({
      counts: {
        submitted: (by.SUBMITTED || 0) + (by.IN_REVIEW || 0) + (by.INCOMPLETE || 0) + (by.COMPLETE || 0) + (by.DELIVERED || 0),
        inReview: (by.SUBMITTED || 0) + (by.IN_REVIEW || 0),
        incomplete: by.INCOMPLETE || 0,
        complete: by.COMPLETE || 0,
        delivered: by.DELIVERED || 0,
        drafts: by.DRAFT || 0,
      },
      recent: recent.map(row),
      drafts: drafts.map(row),
    });
  }),
);

// UC-04 алхам 1: ноорог үүсгэх (ижил idempotencyKey → ижил ноорог)
r.post(
  '/drafts',
  wrap(async (req, res) => {
    const data = parse(
      z.object({
        versionId: z.coerce.number().int().positive(),
        idempotencyKey: z.string().uuid('Хүсэлтийн түлхүүр буруу.'),
      }),
      req.body,
    );

    const existing = await one('SELECT public_id, status FROM applications WHERE applicant_id = ? AND idempotency_key = ?', [
      req.user.id,
      data.idempotencyKey,
    ]);
    if (existing) return res.status(200).json({ publicId: existing.public_id, status: existing.status });

    const v = await one(
      `SELECT v.version_id, v.version_no, v.published_at, t.is_active AS type_active, c.iso_code, c.service_status, ${LATEST_PUBLISHED} AS latest_no
       FROM visa_info_versions v JOIN visa_types t ON t.visa_type_id = v.visa_type_id JOIN countries c ON c.country_id = t.country_id
      WHERE v.version_id = ?`,
      [data.versionId],
    );
    if (!v || !v.published_at) throw notFound('Визийн мэдээлэл олдсонгүй.');
    // UC-04 E1: идэвхгүй улсын шууд хүсэлтийг хориглоно
    if (!canApply(v)) throw new HttpError(403, 'NOT_ACCEPTING', applyBlockReason(v));

    const publicId = makeReference(v.iso_code);
    try {
      await tx(async (q) => {
        const ins = await q(
          `INSERT INTO applications (public_id, applicant_id, version_id, idempotency_key, status) VALUES (?, ?, ?, ?, 'DRAFT')`,
          [publicId, req.user.id, v.version_id, data.idempotencyKey],
        );
        await audit(req, { action: 'DRAFT_CREATE', entityType: 'application', entityKey: publicId, applicationId: ins.insertId }, q);
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        const again = await one('SELECT public_id, status FROM applications WHERE applicant_id = ? AND idempotency_key = ?', [
          req.user.id,
          data.idempotencyKey,
        ]);
        if (again) return res.status(200).json({ publicId: again.public_id, status: again.status });
      }
      throw e;
    }
    res.status(201).json({ publicId, status: 'DRAFT' });
  }),
);

r.get(
  '/drafts/:id',
  wrap(async (req, res) => {
    const a = await ownDraft(req);
    const full = await one(`${APP_SELECT} WHERE a.application_id = ?`, [a.application_id]);
    const detail = await loadApplicationDetail(full, { revealPassport: true });
    res.json({ draft: { ...detail, canSubmit: canApply(a), blockReason: applyBlockReason(a) } });
  }),
);

// FR-04 анкет хадгалах (ноорогт). Паспортын дугаарыг сервер дээр шифрлэнэ.
r.put(
  '/drafts/:id/form',
  wrap(async (req, res) => {
    const a = await ownDraft(req);
    const { data: f, fields } = parseForm(req.body);
    if (fields) throw badRequest('Оруулсан мэдээллийг шалгана уу.', { fields });
    const enc = encryptPassport(f.passportNumber);
    await query(
      `INSERT INTO application_forms (application_id, family_name, given_name, birth_date, nationality_code,
        passport_number_enc, passport_key_id, passport_expires_on, contact_email, contact_phone, travel_purpose,
        intended_entry_on, intended_exit_on, extra_fields)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE family_name=VALUES(family_name), given_name=VALUES(given_name), birth_date=VALUES(birth_date),
        nationality_code=VALUES(nationality_code), passport_number_enc=VALUES(passport_number_enc), passport_key_id=VALUES(passport_key_id),
        passport_expires_on=VALUES(passport_expires_on), contact_email=VALUES(contact_email), contact_phone=VALUES(contact_phone),
        travel_purpose=VALUES(travel_purpose), intended_entry_on=VALUES(intended_entry_on), intended_exit_on=VALUES(intended_exit_on),
        extra_fields=VALUES(extra_fields)`,
      [
        a.application_id,
        f.familyName,
        f.givenName,
        f.birthDate,
        f.nationalityCode,
        enc.data,
        enc.keyId,
        f.passportExpiresOn,
        f.contactEmail,
        f.contactPhone,
        f.travelPurpose,
        f.intendedEntryOn,
        f.intendedExitOn,
        JSON.stringify(f.extraFields),
      ],
    );
    await audit(req, { action: 'DRAFT_FORM_SAVE', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id });
    res.json({ ok: true });
  }),
);

// UC-04 A3: цуцлах — ноорог болон түр файлуудыг устгана
r.delete(
  '/drafts/:id',
  wrap(async (req, res) => {
    const a = await ownDraft(req);
    const docs = await query('SELECT storage_key FROM application_documents WHERE application_id = ?', [a.application_id]);
    await tx(async (q) => {
      await audit(req, { action: 'DRAFT_DELETE', entityType: 'application', entityKey: a.public_id, applicationId: null }, q);
      await q("DELETE FROM applications WHERE application_id = ? AND status = 'DRAFT'", [a.application_id]);
    });
    await Promise.all(docs.map((d) => removeFile(d.storage_key)));
    res.json({ ok: true });
  }),
);

// FR-05 / Зураг 44 Материал хавсаргах
r.post(
  '/drafts/:id/documents',
  uploadSingle,
  wrap(async (req, res) => {
    const a = await ownDraft(req);
    const requirementId = Number(req.body?.requirementId);
    const reqRow = await one('SELECT requirement_id FROM visa_requirements WHERE requirement_id = ? AND version_id = ?', [
      requirementId,
      a.version_id,
    ]);
    if (!reqRow) throw badRequest('Материалын шаардлага олдсонгүй.');
    if (!req.file || !req.file.size) throw badRequest('Файл сонгоно уу.');

    // UC-04 A1: төрөл, хэмжээ шалгах (агуулгын эхний байтаар)
    const mime = detectType(req.file.buffer, req.file.originalname);
    if (!mime) throw badRequest('Зөвхөн PDF, JPG, PNG файл хүлээн авна. Файлын агуулга өргөтгөлтэйгээ таарахгүй байна.');
    const used = await one('SELECT COALESCE(SUM(size_bytes),0) AS total FROM application_documents WHERE application_id = ?', [
      a.application_id,
    ]);
    if (Number(used.total) + req.file.size > config.limits.totalBytes) throw badRequest('Нийт хавсралтын хэмжээ 100 MB-аас хэтэрнэ.');

    const { storageKey, sha256 } = await saveFile(req.file.buffer);
    try {
      const doc = await tx(async (q) => {
        const ins = await q(
          `INSERT INTO application_documents (application_id, version_id, requirement_id, original_name, storage_key, mime_type, size_bytes, sha256, scan_status)
         VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            a.application_id,
            a.version_id,
            requirementId,
            safeFileName(req.file.originalname),
            storageKey,
            mime,
            req.file.size,
            sha256,
            initialScanStatus(), // Үе 3: ClamAV асаалттай бол PENDING
          ],
        );
        await audit(req, { action: 'DOC_UPLOAD', entityType: 'document', entityKey: ins.insertId, applicationId: a.application_id }, q);
        return (await q('SELECT * FROM application_documents WHERE document_id = ?', [ins.insertId]))[0];
      });
      kickScanner();
      res.status(201).json({ document: serializeDoc(doc) });
    } catch (e) {
      await removeFile(storageKey); // E2: бүрэн хадгалагдаагүй файлыг үлдээхгүй
      throw e;
    }
  }),
);

r.delete(
  '/drafts/:id/documents/:docId',
  wrap(async (req, res) => {
    const a = await ownDraft(req);
    const d = await one('SELECT document_id, storage_key FROM application_documents WHERE document_id = ? AND application_id = ?', [
      Number(req.params.docId),
      a.application_id,
    ]);
    if (!d) throw notFound('Файл олдсонгүй.');
    await tx(async (q) => {
      await q('DELETE FROM application_documents WHERE document_id = ?', [d.document_id]);
      await audit(req, { action: 'DOC_DELETE', entityType: 'document', entityKey: d.document_id, applicationId: a.application_id }, q);
    });
    await removeFile(d.storage_key);
    res.json({ ok: true });
  }),
);

/**
 * FR-06/FR-07 Илгээх. BR-06 бүрдэл, BR-07 нэг илгээлт — нэг дугаар.
 * Давтан хүсэлт (A5) өмнө хадгалсан дугаарыг буцаана; нэг транзакцаар архивлана (E4).
 */
r.post(
  '/drafts/:id/submit',
  wrap(async (req, res) => {
    // Үе 2: мэдэгдэл хүрэхийн тулд имэйл баталгаажсан байх (D-24)
    if (config.requireEmailVerification && !req.user.emailVerified) {
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Мэдүүлэг илгээхийн өмнө имэйл хаягаа баталгаажуулна уу.');
    }
    const result = await tx(async (q) => {
      const rows = await q(
        `SELECT a.*, v.version_no, v.published_at, t.is_active AS type_active, c.iso_code, c.service_status,
              ${LATEST_PUBLISHED} AS latest_no
         FROM applications a
         JOIN visa_info_versions v ON v.version_id = a.version_id
         JOIN visa_types t ON t.visa_type_id = v.visa_type_id
         JOIN countries c ON c.country_id = t.country_id
        WHERE a.public_id = ? AND a.applicant_id = ? FOR UPDATE`,
        [req.params.id, req.user.id],
      );
      const a = rows[0];
      if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
      if (a.status !== 'DRAFT') return { publicId: a.public_id, submittedAt: a.submitted_at, repeated: true };

      const blocked = !(
        a.service_status === 'ACTIVE' &&
        config.submittableCountries.includes(a.iso_code) &&
        a.type_active &&
        a.published_at
      );
      if (blocked) throw new HttpError(403, 'NOT_ACCEPTING', 'Энэ улс/визийн төрөлд мэдүүлэг хүлээн авахгүй байна.');

      const missing = [];
      const form = (await q('SELECT * FROM application_forms WHERE application_id = ?', [a.application_id]))[0];
      if (!form) missing.push({ step: 'form', message: 'Анкет бөглөөгүй байна.' });
      else {
        const check = formSchema.safeParse({ ...serializeForm(form, { revealPassport: true }) });
        if (!check.success) missing.push({ step: 'form', message: 'Анкетын зарим талбар хүчингүй болсон (огноо г.м.). Засна уу.' });
      }
      const reqMissing = await q(
        `SELECT q.requirement_id, q.title FROM visa_requirements q
        WHERE q.version_id = ? AND q.is_required = 1
          AND NOT EXISTS (SELECT 1 FROM application_documents d WHERE d.application_id = ? AND d.requirement_id = q.requirement_id AND d.scan_status = 'ACCEPTED')`,
        [a.version_id, a.application_id],
      );
      for (const m of reqMissing) missing.push({ step: 'documents', requirementId: m.requirement_id, message: `Дутуу: ${m.title}` });
      const pending = await q(`SELECT COUNT(*) AS n FROM application_documents WHERE application_id = ? AND scan_status <> 'ACCEPTED'`, [
        a.application_id,
      ]);
      if (Number(pending[0].n) > 0) missing.push({ step: 'documents', message: 'Шалгалт дуусаагүй эсвэл татгалзсан файл байна.' });
      // UC-04 A4: дутуу хэсгийг заана
      if (missing.length) throw new HttpError(422, 'INCOMPLETE', 'Мэдүүлэг дутуу байна.', { missing });

      await q(
        `UPDATE applications SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP(6), archived_at = CURRENT_TIMESTAMP(6)
        WHERE application_id = ? AND status = 'DRAFT'`,
        [a.application_id],
      );
      await audit(req, { action: 'APP_SUBMIT', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id }, q);
      await notify(q, { userId: req.user.id, kind: 'APP_SUBMITTED', applicationId: a.application_id, ref: a.public_id });
      const after = (await q('SELECT submitted_at FROM applications WHERE application_id = ?', [a.application_id]))[0];
      return { publicId: a.public_id, submittedAt: after.submitted_at, repeated: false };
    });
    if (!result.repeated) kickMailer();
    res.status(result.repeated ? 200 : 201).json(result);
  }),
);

// FR-08 / Зураг 47 Миний архив — серверийн шүүлт, хуудаслалт
r.get(
  '/applications',
  wrap(async (req, res) => {
    const f = parse(
      z.object({
        status: z.enum(['SUBMITTED', 'IN_REVIEW', 'INCOMPLETE', 'COMPLETE', 'DELIVERED']).optional(),
        visaTypeId: z.coerce.number().int().positive().optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        q: z.string().max(60).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(10),
      }),
      req.query,
    );
    const where = ['a.applicant_id = ?', "a.status <> 'DRAFT'"];
    const params = [req.user.id];
    if (f.status) {
      where.push('a.status = ?');
      params.push(f.status);
    }
    if (f.visaTypeId) {
      where.push('v.visa_type_id = ?');
      params.push(f.visaTypeId);
    }
    if (f.from) {
      where.push('a.submitted_at >= ?');
      params.push(`${f.from} 00:00:00`);
    }
    if (f.to) {
      where.push('a.submitted_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(f.to);
    }
    if (f.q) {
      where.push('a.public_id LIKE ?');
      params.push(`%${f.q}%`);
    }
    const total = await one(
      `SELECT COUNT(*) AS n FROM applications a JOIN visa_info_versions v ON v.version_id = a.version_id WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await query(`${APP_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      f.pageSize,
      (f.page - 1) * f.pageSize,
    ]);
    const types = await query(
      `SELECT DISTINCT t.visa_type_id, t.code FROM applications a JOIN visa_info_versions v ON v.version_id = a.version_id
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id WHERE a.applicant_id = ? AND a.status <> 'DRAFT' ORDER BY t.code`,
      [req.user.id],
    );
    res.json({
      total: Number(total.n),
      page: f.page,
      pageSize: f.pageSize,
      visaTypes: types.map((t) => ({ id: t.visa_type_id, code: t.code })),
      items: rows.map((a) => ({
        publicId: a.public_id,
        status: a.status,
        statusLabel: STATUS_LABEL[a.status],
        visaCode: a.code,
        visaName: a.name_mn,
        country: a.country_name,
        submittedAt: a.submitted_at,
      })),
    });
  }),
);

// UC-05 / Зураг 48 Мэдүүлгийн дэлгэрэнгүй (зөвхөн уншина)
r.get(
  '/applications/:id',
  wrap(async (req, res) => {
    const a = await one(`${APP_SELECT} WHERE a.public_id = ? AND a.applicant_id = ? AND a.status <> 'DRAFT'`, [req.params.id, req.user.id]);
    if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
    await audit(req, { action: 'APP_VIEW', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id });
    res.json({ application: await loadApplicationDetail(a, { revealPassport: false }) });
  }),
);

// Архиваас анкетын мэдээлэл хуулах (шинэ ноорогт ашиглах; хавсралтыг хуулахгүй — хугацаатай баримтыг дахин шалгуулна)
r.get(
  '/applications/:id/form-copy',
  wrap(async (req, res) => {
    const a = await one(`SELECT application_id FROM applications WHERE public_id = ? AND applicant_id = ? AND status <> 'DRAFT'`, [
      req.params.id,
      req.user.id,
    ]);
    if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
    const f = await one('SELECT * FROM application_forms WHERE application_id = ?', [a.application_id]);
    const form = serializeForm(f, { revealPassport: true });
    if (form) {
      delete form.intendedEntryOn;
      delete form.intendedExitOn;
    }
    res.json({ form });
  }),
);

export default r;
