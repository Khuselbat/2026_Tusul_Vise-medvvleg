// Үе 1.2 — Албан ёсны үр дүн бүртгэх (F11, тайлан 5.3 алхам 5).
// Мэдүүлэгч Korea Visa Portal-аас ӨӨРӨӨ харсан үр дүнгээ бүртгэнэ — энэ нь системийн шийдвэр БИШ (BR-09).
// Зөвхөн нэмэгдэнэ: засах/устгах endpoint байхгүй; залруулга = шинэ бичлэг. Оператор/админ үүнийг өөрчлөхгүй.
import { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db.js';
import { wrap, parse } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { receiveFiles, storeFiles, discardFiles, insertEvidence } from '../lib/uploads.js';
import { requireRole } from '../middleware/auth.js';
import { ownSubmitted } from './supplements.js';

const r = Router();
r.use(requireRole('APPLICANT'));

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу байна.');

export const resultSchema = z.object({
  outcome: z.enum(['PENDING', 'APPROVED', 'REFUSED'], { errorMap: () => ({ message: 'Үр дүнгээ сонгоно уу.' }) }),
  checkedOn: isoDate.refine((d) => d <= today(), 'Шалгасан огноо ирээдүйд байж болохгүй.'),
  source: z.string().trim().min(2, 'Эх сурвалжаа бичнэ үү (ж: Korea Visa Portal).').max(150),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || /^https:\/\/[^\s]+$/.test(s), 'Зөвхөн HTTPS холбоос.'),
  idempotencyKey: z.string().uuid('Хүсэлтийн түлхүүр буруу.'),
});

r.post(
  '/applications/:id/official-results',
  receiveFiles(),
  wrap(async (req, res) => {
    const data = parse(resultSchema, req.body);
    const stored = req.file ? await storeFiles([req.file]) : [];
    let out;
    try {
      out = await tx(async (q) => {
        const a = await ownSubmitted(req, q, { lock: true });
        const dup = (
          await q('SELECT entry_no FROM official_results WHERE application_id = ? AND idempotency_key = ?', [
            a.application_id,
            data.idempotencyKey,
          ])
        )[0];
        if (dup) return { entryNo: dup.entry_no, repeated: true };
        const entryNo = Number(
          (await q('SELECT COALESCE(MAX(entry_no),0) + 1 AS n FROM official_results WHERE application_id = ?', [a.application_id]))[0].n,
        );
        const evidenceId = stored[0]
          ? await insertEvidence(q, { kind: 'OFFICIAL_RESULT', applicationId: a.application_id, uploadedBy: req.user.id, file: stored[0] })
          : null;
        await q(
          `INSERT INTO official_results (application_id, entry_no, idempotency_key, outcome, checked_on, source, source_url, evidence_file_id, recorded_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            a.application_id,
            entryNo,
            data.idempotencyKey,
            data.outcome,
            data.checkedOn,
            data.source,
            data.sourceUrl,
            evidenceId,
            req.user.id,
          ],
        );
        await audit(
          req,
          {
            action: 'OFFICIAL_RESULT_RECORD',
            entityType: 'official_result',
            entityKey: `${a.public_id}#R${entryNo}`,
            applicationId: a.application_id,
          },
          q,
        );
        return { entryNo, repeated: false };
      });
    } catch (e) {
      await discardFiles(stored);
      throw e;
    }
    if (out.repeated) await discardFiles(stored);
    res.status(out.repeated ? 200 : 201).json({ entryNo: out.entryNo });
  }),
);

export default r;
