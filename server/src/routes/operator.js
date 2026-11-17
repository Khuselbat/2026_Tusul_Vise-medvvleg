import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db.js';
import { wrap, parse, notFound, forbidden, conflict, badRequest } from '../lib/errors.js';
import { receiveFiles, storeFiles, discardFiles, insertEvidence } from '../lib/uploads.js';
import { audit } from '../lib/audit.js';
import { STATUS_LABEL } from '../lib/visa.js';
import { loadApplicationDetail, APP_SELECT } from '../lib/applications.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('OPERATOR'));

/** BR-02: оператор зөвхөн өөрт хуваарилагдсан мэдүүлэгт хандана. Өөр операторынх → 403 */
async function assignedApp(req) {
  const a = await one(`${APP_SELECT} WHERE a.public_id = ? AND a.status <> 'DRAFT'`, [req.params.id]);
  if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
  if (a.assigned_operator_id !== req.user.id) {
    await audit(req, { action: 'APP_ACCESS_DENIED', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id });
    throw forbidden('Энэ мэдүүлэг танд хуваарилагдаагүй байна.');
  }
  return a;
}

// Зураг 51 Ажлын жагсаалт
r.get(
  '/applications',
  wrap(async (req, res) => {
    const f = parse(
      z.object({
        latest: z.enum(['NONE', 'COMPLETE', 'INCOMPLETE']).optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    const where = ['a.assigned_operator_id = ?', "a.status <> 'DRAFT'"];
    const params = [req.user.id];
    if (f.from) {
      where.push('a.submitted_at >= ?');
      params.push(`${f.from} 00:00:00`);
    }
    if (f.to) {
      where.push('a.submitted_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(f.to);
    }
    const LATEST = `(SELECT r.completeness FROM reviews r WHERE r.application_id = a.application_id ORDER BY r.review_no DESC LIMIT 1)`;
    if (f.latest === 'NONE') where.push(`${LATEST} IS NULL`);
    else if (f.latest) {
      where.push(`${LATEST} = ?`);
      params.push(f.latest);
    }
    const rows = await query(
      `SELECT x.*, ${LATEST.replaceAll('a.application_id', 'x.application_id')} AS latest_review,
            (SELECT COUNT(*) FROM application_documents d WHERE d.application_id = x.application_id) AS doc_count
       FROM (${APP_SELECT} WHERE ${where.join(' AND ')}) x
      ORDER BY x.submitted_at ASC`,
      params,
    );
    res.json({
      items: rows.map((a) => ({
        publicId: a.public_id,
        applicantName: a.applicant_name,
        visaCode: a.code,
        visaName: a.name_mn,
        country: a.country_name,
        submittedAt: a.submitted_at,
        status: a.status,
        statusLabel: STATUS_LABEL[a.status],
        latestReview: a.latest_review,
        documentCount: Number(a.doc_count),
      })),
    });
  }),
);

r.get(
  '/stats',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT a.status, COUNT(*) AS n FROM applications a WHERE a.assigned_operator_id = ? AND a.status <> 'DRAFT' GROUP BY a.status`,
      [req.user.id],
    );
    const reviewsToday = await one('SELECT COUNT(*) AS n FROM reviews WHERE operator_id = ? AND reviewed_at >= CURRENT_DATE', [
      req.user.id,
    ]);
    res.json({ byStatus: Object.fromEntries(rows.map((x) => [x.status, Number(x.n)])), reviewsToday: Number(reviewsToday.n) });
  }),
);

// Миний оруулсан үнэлгээнүүд (цэсний "Үнэлгээний түүх")
r.get(
  '/reviews',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT r.review_no, r.completeness, r.comment, r.reviewed_at, a.public_id, a.assigned_operator_id, t.code
       FROM reviews r JOIN applications a ON a.application_id = r.application_id
       JOIN visa_info_versions v ON v.version_id = a.version_id JOIN visa_types t ON t.visa_type_id = v.visa_type_id
      WHERE r.operator_id = ? ORDER BY r.reviewed_at DESC LIMIT 200`,
      [req.user.id],
    );
    res.json({
      items: rows.map((x) => ({
        publicId: x.public_id,
        reviewNo: x.review_no,
        completeness: x.completeness,
        comment: x.comment,
        reviewedAt: x.reviewed_at,
        visaCode: x.code,
        stillAssigned: x.assigned_operator_id === req.user.id,
      })),
    });
  }),
);

// Зураг 52 Материал шалгаж үнэлэх
r.get(
  '/applications/:id',
  wrap(async (req, res) => {
    const a = await assignedApp(req);
    await audit(req, { action: 'APP_VIEW', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id });
    res.json({ application: await loadApplicationDetail(a, { revealPassport: false, viewer: 'OPERATOR' }) }); // Зураг 52: паспорт нууцлагдсан
  }),
);

/**
 * UC-07 / FR-10 Бүрдлийн үнэлгээ хадгалах — өмнөх мөрийг дарж засахгүй, шинэ мөр нэмнэ.
 * expectedReviewNo-оор зэрэгцээ өөрчлөлтийг илрүүлнэ (409 → дахин уншуулна).
 */
r.post(
  '/applications/:id/reviews',
  wrap(async (req, res) => {
    const data = parse(
      z
        .object({
          completeness: z.enum(['COMPLETE', 'INCOMPLETE'], { errorMap: () => ({ message: 'Бүрэн эсвэл дутуу гэдгийг сонгоно уу.' }) }),
          comment: z.string().trim().max(4000).optional().default(''),
          expectedReviewNo: z.coerce.number().int().min(0),
        })
        .refine((d) => d.completeness === 'COMPLETE' || d.comment.length > 0, {
          path: ['comment'],
          message: 'Дутуу гэж үнэлэхэд тайлбар заавал бичнэ.',
        }),
      req.body,
    );

    const out = await tx(async (q) => {
      const a = (
        await q(
          `SELECT application_id, public_id, assigned_operator_id, status FROM applications WHERE public_id = ? AND status <> 'DRAFT' FOR UPDATE`,
          [req.params.id],
        )
      )[0];
      if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
      if (a.assigned_operator_id !== req.user.id) throw conflict('Хуваарилалт өөрчлөгдсөн байна. Жагсаалтаа дахин уншина уу.');
      if (a.status === 'DELIVERED') throw conflict('Хүргүүлсэн мэдүүлэгт бүрдлийн үнэлгээ нэмэхгүй.');
      const last = (await q('SELECT COALESCE(MAX(review_no),0) AS n FROM reviews WHERE application_id = ?', [a.application_id]))[0];
      if (Number(last.n) !== data.expectedReviewNo) throw conflict('Энэ мэдүүлэгт шинэ үнэлгээ нэмэгдсэн байна. Дахин уншина уу.');
      const reviewNo = Number(last.n) + 1;
      await q('INSERT INTO reviews (application_id, operator_id, review_no, completeness, comment) VALUES (?,?,?,?,?)', [
        a.application_id,
        req.user.id,
        reviewNo,
        data.completeness,
        data.comment || null,
      ]);
      await q('UPDATE applications SET status = ? WHERE application_id = ?', [data.completeness, a.application_id]);
      await audit(
        req,
        { action: 'REVIEW_CREATE', entityType: 'review', entityKey: `${a.public_id}#${reviewNo}`, applicationId: a.application_id },
        q,
      );
      return { reviewNo };
    });
    res.status(201).json(out);
  }),
);

// Зураг 53 Үнэлгээний түүх (review_no буурахаар; засах/устгах үйлдэлгүй)
r.get(
  '/applications/:id/reviews',
  wrap(async (req, res) => {
    const a = await assignedApp(req);
    const rows = await query(
      `SELECT r.review_no, r.completeness, r.comment, r.reviewed_at, u.display_name AS operator_name
       FROM reviews r JOIN users u ON u.user_id = r.operator_id WHERE r.application_id = ? ORDER BY r.review_no DESC`,
      [a.application_id],
    );
    res.json({
      publicId: a.public_id,
      reviews: rows.map((x) => ({
        reviewNo: x.review_no,
        completeness: x.completeness,
        comment: x.comment,
        reviewedAt: x.reviewed_at,
        operatorName: x.operator_name,
      })),
    });
  }),
);

/**
 * Үе 1.4 — “Эрх бүхий байгууллагад хүргүүлсэн” (тайлан 4.2, 5.3). Зөвхөн хуваарилагдсан оператор,
 * зөвхөн “Бүрдэл бүрэн” төлвөөс, албан дугаар + огноо + нотолгоо файлтай. Нэг удаа; засахгүй.
 */
const today = () => new Date().toISOString().slice(0, 10);
const handoverSchema = z.object({
  authority: z.string().trim().min(2, 'Хүлээн авсан байгууллагыг бичнэ үү (ж: KVAC).').max(150),
  officialRef: z.string().trim().min(1, 'Албан бүртгэлийн дугаар заавал.').max(64),
  deliveredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу байна.')
    .refine((d) => d <= today(), 'Хүргүүлсэн огноо ирээдүйд байж болохгүй.'),
  note: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((s) => s || null),
});

r.post(
  '/applications/:id/handover',
  receiveFiles(),
  wrap(async (req, res) => {
    const data = parse(handoverSchema, req.body);
    if (!req.file) throw badRequest('Хүргүүлсэн нотолгоо файл заавал.', { fields: { file: 'Нотолгоо файл хавсаргана уу.' } });
    const stored = await storeFiles([req.file]);
    try {
      await tx(async (q) => {
        const a = (
          await q(
            `SELECT application_id, public_id, assigned_operator_id, status, submitted_at FROM applications
                    WHERE public_id = ? AND status <> 'DRAFT' FOR UPDATE`,
            [req.params.id],
          )
        )[0];
        if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
        if (a.assigned_operator_id !== req.user.id) throw forbidden('Энэ мэдүүлэг танд хуваарилагдаагүй байна.');
        if (a.status === 'DELIVERED') throw conflict('Хүргүүлсэн бүртгэл аль хэдийн хийгдсэн.');
        if (a.status !== 'COMPLETE') throw conflict('Зөвхөн “Бүрдэл бүрэн” мэдүүлгийг хүргүүлсэн гэж бүртгэнэ.');
        if (data.deliveredOn < new Date(a.submitted_at).toISOString().slice(0, 10)) {
          throw badRequest('Оруулсан мэдээллийг шалгана уу.', { fields: { deliveredOn: 'Илгээсэн огнооноос өмнө байж болохгүй.' } });
        }
        const evidenceId = await insertEvidence(q, {
          kind: 'HANDOVER',
          applicationId: a.application_id,
          uploadedBy: req.user.id,
          file: stored[0],
        });
        await q(
          `INSERT INTO application_handovers (application_id, operator_id, authority, official_ref, delivered_on, evidence_file_id, note)
           VALUES (?,?,?,?,?,?,?)`,
          [a.application_id, req.user.id, data.authority, data.officialRef, data.deliveredOn, evidenceId, data.note],
        );
        await q("UPDATE applications SET status = 'DELIVERED' WHERE application_id = ?", [a.application_id]);
        await audit(
          req,
          { action: 'HANDOVER_RECORD', entityType: 'application', entityKey: a.public_id, applicationId: a.application_id },
          q,
        );
      });
    } catch (e) {
      await discardFiles(stored);
      throw e;
    }
    res.status(201).json({ ok: true });
  }),
);

/**
 * Үе 1.2 / Q1 — Мэдүүлэгчийн бүртгэсэн албан үр дүнг нотолгоо файлтай нь тулгах.
 * Мэдүүлэгчийн бичлэгийг ӨӨРЧЛӨХГҮЙ — тусдаа тэмдэглэл (нэг бичлэгт нэг удаа). Визийн шийдвэр биш.
 */
r.post(
  '/applications/:id/official-results/:entryNo/verification',
  wrap(async (req, res) => {
    const data = parse(
      z
        .object({
          verdict: z.enum(['MATCHES', 'MISMATCH'], { errorMap: () => ({ message: 'Тулгалтын дүнг сонгоно уу.' }) }),
          note: z.string().trim().max(4000).optional().default(''),
        })
        .refine((d) => d.verdict === 'MATCHES' || d.note.length > 0, { path: ['note'], message: 'Таараагүй бол шалтгааныг бичнэ.' }),
      req.body,
    );
    const entryNo = Number(req.params.entryNo);
    if (!Number.isInteger(entryNo) || entryNo <= 0) throw notFound('Бичлэг олдсонгүй.');
    await tx(async (q) => {
      const a = (
        await q(
          "SELECT application_id, public_id, assigned_operator_id FROM applications WHERE public_id = ? AND status <> 'DRAFT' FOR UPDATE",
          [req.params.id],
        )
      )[0];
      if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
      if (a.assigned_operator_id !== req.user.id) throw forbidden('Энэ мэдүүлэг танд хуваарилагдаагүй байна.');
      const res0 = (
        await q('SELECT result_id, evidence_file_id FROM official_results WHERE application_id = ? AND entry_no = ?', [
          a.application_id,
          entryNo,
        ])
      )[0];
      if (!res0) throw notFound('Бичлэг олдсонгүй.');
      if (!res0.evidence_file_id) throw conflict('Нотолгоо файлгүй бичлэгийг тулгахгүй.');
      const done = (await q('SELECT 1 FROM official_result_verifications WHERE result_id = ?', [res0.result_id]))[0];
      if (done) throw conflict('Энэ бичлэгийг аль хэдийн тулгасан.');
      await q('INSERT INTO official_result_verifications (result_id, operator_id, verdict, note) VALUES (?,?,?,?)', [
        res0.result_id,
        req.user.id,
        data.verdict,
        data.note || null,
      ]);
      await audit(
        req,
        {
          action: 'OFFICIAL_RESULT_VERIFY',
          entityType: 'official_result',
          entityKey: `${a.public_id}#R${entryNo}`,
          applicationId: a.application_id,
        },
        q,
      );
    });
    res.status(201).json({ ok: true });
  }),
);

export default r;
