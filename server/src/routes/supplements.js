// Үе 1.1 — Нэмэлт материалын багц (F07, UC-07 A1 → мэдүүлэгчийн хариу).
// Оператор “Дутуу” гэсний дараа мэдүүлэгч анхны илгээлтийг ЗАСАХГҮЙГЭЭР (BR-07) шинэ багц илгээнэ.
// Багц: ноорог (DRAFT) → файл нэмэх/хасах, тайлбар → илгээх (SUBMITTED, буцаахгүй). Оператор дараагийн үнэлгээг хийнэ.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { wrap, parse, badRequest, notFound, conflict, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { removeFile } from '../lib/storage.js';
import { serializeDoc } from '../lib/applications.js';
import { receiveFiles, storeFiles, discardFiles, applicationBytesUsed } from '../lib/uploads.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('APPLICANT'));

const NOT_INCOMPLETE = 'Нэмэлт материалыг зөвхөн “Нэмэлт материал шаардсан” төлөвтэй мэдүүлэгт илгээнэ.';

/** Эзэмшигчийн илгээсэн мэдүүлэг (BR-02) — бусдынх 404. */
export async function ownSubmitted(req, q = query, { lock = false } = {}) {
  const rows = await q(
    `SELECT application_id, public_id, version_id, status, assigned_operator_id FROM applications
      WHERE public_id = ? AND applicant_id = ? AND status <> 'DRAFT' ${lock ? 'FOR UPDATE' : ''}`,
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw notFound('Мэдүүлэг олдсонгүй.');
  return rows[0];
}

function roundParam(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound('Нэмэлт материалын багц олдсонгүй.');
  return n;
}

async function latestReview(q, applicationId) {
  return (
    await q('SELECT review_id, review_no, completeness FROM reviews WHERE application_id = ? ORDER BY review_no DESC LIMIT 1', [
      applicationId,
    ])
  )[0];
}

/** Ноорог багц (FOR UPDATE). Илгээсэн бол 409 — илгээсэн багцыг засахгүй. */
async function draftRound(q, app, roundNo) {
  const s = (
    await q('SELECT * FROM application_supplements WHERE application_id = ? AND round_no = ? FOR UPDATE', [app.application_id, roundNo])
  )[0];
  if (!s) throw notFound('Нэмэлт материалын багц олдсонгүй.');
  if (s.status !== 'DRAFT') throw conflict('Илгээсэн багцыг өөрчлөхгүй.');
  return s;
}

// Багц эхлүүлэх (давтан дарахад ижил ноорог буцаана)
r.post(
  '/applications/:id/supplements',
  wrap(async (req, res) => {
    const out = await tx(async (q) => {
      const a = await ownSubmitted(req, q, { lock: true });
      if (a.status !== 'INCOMPLETE') throw conflict(NOT_INCOMPLETE);
      const last = await latestReview(q, a.application_id);
      if (!last || last.completeness !== 'INCOMPLETE') throw conflict(NOT_INCOMPLETE);
      const draft = (
        await q("SELECT supplement_id, round_no, review_id FROM application_supplements WHERE application_id = ? AND status = 'DRAFT'", [
          a.application_id,
        ])
      )[0];
      if (draft) {
        // Ноорог байх хооронд оператор дахин “Дутуу” гэсэн бол ноорог хамгийн сүүлийн хүсэлтэд хариулна
        if (draft.review_id !== last.review_id) {
          await q('UPDATE application_supplements SET review_id = ? WHERE supplement_id = ?', [last.review_id, draft.supplement_id]);
        }
        return { roundNo: draft.round_no, created: false };
      }
      const answered = (await q('SELECT 1 FROM application_supplements WHERE review_id = ?', [last.review_id]))[0];
      if (answered) throw conflict('Энэ үнэлгээнд нэмэлт материал аль хэдийн илгээгдсэн.');
      const roundNo = Number(
        (await q('SELECT COALESCE(MAX(round_no),0) + 1 AS n FROM application_supplements WHERE application_id = ?', [a.application_id]))[0]
          .n,
      );
      await q('INSERT INTO application_supplements (application_id, round_no, review_id) VALUES (?,?,?)', [
        a.application_id,
        roundNo,
        last.review_id,
      ]);
      await audit(
        req,
        { action: 'SUPPLEMENT_CREATE', entityType: 'supplement', entityKey: `${a.public_id}#S${roundNo}`, applicationId: a.application_id },
        q,
      );
      return { roundNo, created: true };
    });
    res.status(out.created ? 201 : 200).json({ roundNo: out.roundNo });
  }),
);

// Тайлбар (мэдүүлэгчийн хариу)
r.put(
  '/applications/:id/supplements/:round',
  wrap(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().max(4000, 'Тайлбар хэт урт байна.').default('') }), req.body);
    await tx(async (q) => {
      const a = await ownSubmitted(req, q, { lock: true });
      const s = await draftRound(q, a, roundParam(req.params.round));
      await q('UPDATE application_supplements SET note = ? WHERE supplement_id = ?', [note || null, s.supplement_id]);
      await audit(
        req,
        {
          action: 'SUPPLEMENT_NOTE',
          entityType: 'supplement',
          entityKey: `${a.public_id}#S${s.round_no}`,
          applicationId: a.application_id,
        },
        q,
      );
    });
    res.json({ ok: true });
  }),
);

// Багцад файл нэмэх (BR-05; нийт хэмжээнд анхны илгээлт орно)
r.post(
  '/applications/:id/supplements/:round/documents',
  receiveFiles(),
  wrap(async (req, res) => {
    const requirementId = Number(req.body?.requirementId);
    const roundNo = roundParam(req.params.round);
    if (!req.file) throw badRequest('Файл сонгоно уу.');
    const [file] = await storeFiles([req.file]);
    try {
      const doc = await tx(async (q) => {
        const a = await ownSubmitted(req, q, { lock: true });
        const s = await draftRound(q, a, roundNo);
        const reqRow = (
          await q('SELECT requirement_id FROM visa_requirements WHERE requirement_id = ? AND version_id = ?', [requirementId, a.version_id])
        )[0];
        if (!reqRow) throw badRequest('Материалын шаардлага олдсонгүй.');
        if ((await applicationBytesUsed(q, a.application_id)) + file.size > config.limits.totalBytes) {
          throw badRequest('Нийт хавсралтын хэмжээ 100 MB-аас хэтэрнэ.');
        }
        const ins = await q(
          `INSERT INTO application_documents (application_id, version_id, requirement_id, supplement_id, original_name, storage_key, mime_type, size_bytes, sha256, scan_status)
           VALUES (?,?,?,?,?,?,?,?,?, 'ACCEPTED')`,
          [
            a.application_id,
            a.version_id,
            requirementId,
            s.supplement_id,
            file.originalName,
            file.storageKey,
            file.mime,
            file.size,
            file.sha256,
          ],
        );
        await audit(
          req,
          { action: 'SUPPLEMENT_DOC_UPLOAD', entityType: 'document', entityKey: ins.insertId, applicationId: a.application_id },
          q,
        );
        return (await q('SELECT * FROM application_documents WHERE document_id = ?', [ins.insertId]))[0];
      });
      res.status(201).json({ document: serializeDoc(doc) });
    } catch (e) {
      await discardFiles([file]);
      throw e;
    }
  }),
);

r.delete(
  '/applications/:id/supplements/:round/documents/:docId',
  wrap(async (req, res) => {
    const roundNo = roundParam(req.params.round);
    const key = await tx(async (q) => {
      const a = await ownSubmitted(req, q, { lock: true });
      const s = await draftRound(q, a, roundNo);
      const d = (
        await q('SELECT document_id, storage_key FROM application_documents WHERE document_id = ? AND supplement_id = ?', [
          Number(req.params.docId),
          s.supplement_id,
        ])
      )[0];
      if (!d) throw notFound('Файл олдсонгүй.');
      await q('DELETE FROM application_documents WHERE document_id = ?', [d.document_id]);
      await audit(
        req,
        { action: 'SUPPLEMENT_DOC_DELETE', entityType: 'document', entityKey: d.document_id, applicationId: a.application_id },
        q,
      );
      return d.storage_key;
    });
    await removeFile(key);
    res.json({ ok: true });
  }),
);

// Ноорог багцыг цуцлах — файлуудтай нь устгана (анхны илгээлтэд нөлөөлөхгүй)
r.delete(
  '/applications/:id/supplements/:round',
  wrap(async (req, res) => {
    const roundNo = roundParam(req.params.round);
    const keys = await tx(async (q) => {
      const a = await ownSubmitted(req, q, { lock: true });
      const s = await draftRound(q, a, roundNo);
      const docs = await q('SELECT storage_key FROM application_documents WHERE supplement_id = ?', [s.supplement_id]);
      await q('DELETE FROM application_supplements WHERE supplement_id = ?', [s.supplement_id]);
      await audit(
        req,
        { action: 'SUPPLEMENT_CANCEL', entityType: 'supplement', entityKey: `${a.public_id}#S${roundNo}`, applicationId: a.application_id },
        q,
      );
      return docs.map((d) => d.storage_key);
    });
    await Promise.all(keys.map((k) => removeFile(k)));
    res.json({ ok: true });
  }),
);

// Илгээх — нэг транзакц; давтан хүсэлт өмнөх үр дүнг буцаана (UC-04 A5-тай ижил)
r.post(
  '/applications/:id/supplements/:round/submit',
  wrap(async (req, res) => {
    const roundNo = roundParam(req.params.round);
    const out = await tx(async (q) => {
      const a = await ownSubmitted(req, q, { lock: true });
      const s = (
        await q('SELECT * FROM application_supplements WHERE application_id = ? AND round_no = ? FOR UPDATE', [a.application_id, roundNo])
      )[0];
      if (!s) throw notFound('Нэмэлт материалын багц олдсонгүй.');
      if (s.status === 'SUBMITTED') return { roundNo, submittedAt: s.submitted_at, repeated: true };
      if (a.status !== 'INCOMPLETE') throw conflict(NOT_INCOMPLETE);
      const last = await latestReview(q, a.application_id);
      if (!last || last.review_id !== s.review_id) throw conflict('Мэдүүлэгт шинэ үнэлгээ нэмэгдсэн байна. Дахин уншина уу.');
      const n = Number((await q('SELECT COUNT(*) AS n FROM application_documents WHERE supplement_id = ?', [s.supplement_id]))[0].n);
      if (n === 0) {
        throw new HttpError(422, 'INCOMPLETE', 'Нэмэлт материал хавсаргаагүй байна.', {
          missing: [{ step: 'documents', message: 'Дор хаяж нэг файл хавсаргана уу.' }],
        });
      }
      await q("UPDATE application_supplements SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP(6) WHERE supplement_id = ?", [
        s.supplement_id,
      ]);
      // Оператор хуваарилагдсан бол дахин хянах, үгүй бол админ хуваарилахыг хүлээнэ
      await q('UPDATE applications SET status = ? WHERE application_id = ?', [
        a.assigned_operator_id ? 'IN_REVIEW' : 'SUBMITTED',
        a.application_id,
      ]);
      await audit(
        req,
        { action: 'SUPPLEMENT_SUBMIT', entityType: 'supplement', entityKey: `${a.public_id}#S${roundNo}`, applicationId: a.application_id },
        q,
      );
      const after = (await q('SELECT submitted_at FROM application_supplements WHERE supplement_id = ?', [s.supplement_id]))[0];
      return { roundNo, submittedAt: after.submitted_at, repeated: false };
    });
    res.status(out.repeated ? 200 : 201).json(out);
  }),
);

export default r;
