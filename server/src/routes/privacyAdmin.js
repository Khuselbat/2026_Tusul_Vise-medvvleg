// Үе 3 — админ: бүртгэл устгах хүсэлтийг шийдвэрлэх. Админ хувийн агуулга (анкет, файл) харахгүй —
// зөвхөн имэйл, нэр, огноо, мэдүүлгийн тоо.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { wrap, parse, notFound, conflict } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { removeFile } from '../lib/storage.js';
import { eraseApplicant, activeApplicationCount } from '../lib/erasure.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('ADMIN'));

r.get(
  '/deletion-requests',
  wrap(async (req, res) => {
    const status = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(req.query.status) ? req.query.status : 'PENDING';
    const rows = await query(
      `SELECT d.*, u.email, u.display_name, ud.display_name AS decider_name,
              (SELECT COUNT(*) FROM applications a WHERE a.applicant_id = d.user_id AND a.status <> 'DRAFT') AS app_count,
              (SELECT COUNT(*) FROM applications a WHERE a.applicant_id = d.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS active_count
         FROM account_deletion_requests d JOIN users u ON u.user_id = d.user_id LEFT JOIN users ud ON ud.user_id = d.decided_by
        WHERE d.status = ? ORDER BY d.requested_at LIMIT 200`,
      [status],
    );
    res.json({
      items: rows.map((x) => ({
        id: x.request_id,
        status: x.status,
        email: x.email,
        name: x.display_name,
        reason: x.reason,
        requestedAt: x.requested_at,
        decidedAt: x.decided_at,
        decidedBy: x.decider_name,
        decisionNote: x.decision_note,
        applications: Number(x.app_count),
        activeApplications: Number(x.active_count),
      })),
    });
  }),
);

async function lockPending(q, id) {
  const x = (await q('SELECT * FROM account_deletion_requests WHERE request_id = ? FOR UPDATE', [Number(id) || 0]))[0];
  if (!x) throw notFound('Хүсэлт олдсонгүй.');
  if (x.status !== 'PENDING') throw conflict('Энэ хүсэлт аль хэдийн шийдвэрлэгдсэн.');
  return x;
}

r.post(
  '/deletion-requests/:id/approve',
  wrap(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().max(500).optional().default('') }), req.body);
    const out = await tx(async (q) => {
      const x = await lockPending(q, req.params.id);
      const active = await activeApplicationCount(q, x.user_id);
      if (active > 0) {
        throw conflict(`Хэрэглэгчийн ${active} мэдүүлэг хянагдаж байна. Бүрдлийн хяналт дууссаны дараа устгана.`);
      }
      const result = await eraseApplicant(q, x.user_id);
      await q(
        "UPDATE account_deletion_requests SET status = 'APPROVED', decided_by = ?, decided_at = CURRENT_TIMESTAMP(6), decision_note = ? WHERE request_id = ?",
        [req.user.id, note || null, x.request_id],
      );
      await audit(req, { action: 'ACCOUNT_ERASE', entityType: 'deletion_request', entityKey: x.request_id }, q);
      return result;
    });
    // Commit-ийн дараа файлыг хадгалалтаас устгана (амжилтгүй бол өнчин файл цэвэрлэгээ дараа нь арилгана)
    await Promise.all(out.storageKeys.map((k) => removeFile(k).catch((err) => logger.warn({ err }, 'erase file failed'))));
    res.json({ ok: true, files: out.storageKeys.length, applications: out.applications, imports: out.imports });
  }),
);

r.post(
  '/deletion-requests/:id/reject',
  wrap(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().min(3, 'Татгалзсан шалтгааныг бичнэ үү.').max(500) }), req.body);
    await tx(async (q) => {
      const x = await lockPending(q, req.params.id);
      await q(
        "UPDATE account_deletion_requests SET status = 'REJECTED', decided_by = ?, decided_at = CURRENT_TIMESTAMP(6), decision_note = ? WHERE request_id = ?",
        [req.user.id, note, x.request_id],
      );
      await audit(req, { action: 'DELETION_REJECT', entityType: 'deletion_request', entityKey: x.request_id }, q);
    });
    res.json({ ok: true });
  }),
);

export default r;
