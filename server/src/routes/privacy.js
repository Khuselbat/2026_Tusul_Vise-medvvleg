// Үе 3 — мэдүүлэгчийн хувийн мэдээлэл: бүх мэдээллээ PDF-ээр татах (өмнө нь ZIP), бүртгэл устгах хүсэлт (тайлан 4.5).
// Хоёулаа нууц үгээ дахин оруулж баталгаажуулна (сесс хулгайлагдсан үед мэдээлэл алдагдахаас хамгаална).
import { Router } from 'express';
import { verifyPassword } from '../lib/password.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db.js';
import { wrap, parse, badRequest, conflict, notFound, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { notify, kickMailer } from '../lib/notify.js';
import { requireRole } from '../middleware/auth.js';
import { buildExportPdf } from '../lib/exportPdf.js';

const r = Router();
r.use(requireRole('APPLICANT'));

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 1000 : 5,
  keyGenerator: (req) => `u${req.user.id}`,
  handler: (_req, _res, next) => next(new HttpError(429, 'TOO_MANY', 'Олон удаа оролдлоо. Нэг цагийн дараа дахин оролдоно уу.')),
});

async function confirmPassword(req, password) {
  const u = await one('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id]);
  if (!password || !(await verifyPassword(password, u.password_hash))) {
    throw badRequest('Нууц үг буруу байна.', { fields: { password: 'Нууц үг буруу байна.' } });
  }
}

// Бүх мэдээллээ НЭГ PDF-ээр татах (POST — нууц үгтэй; CSRF толгой заавал). Хавсралтуудыг мэдүүлэг бүрийн ард нэгтгэнэ.
// Паспортын дугаар бүтнээр — зөвхөн эзэмшигчид (энэ endpoint зөвхөн APPLICANT, өөрийн мэдээлэл). Цагт 5 удаа.
r.post(
  '/privacy/export',
  exportLimiter,
  wrap(async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1, 'Нууц үгээ оруулна уу.').max(256) }), req.body);
    await confirmPassword(req, password);
    const pdf = await buildExportPdf(req.user.id);
    await audit(req, { action: 'DATA_EXPORT', entityType: 'user', entityKey: req.user.id });
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `attachment; filename="civiz-export-${stamp}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(pdf);
  }),
);

// ───────────── Бүртгэл устгах хүсэлт ─────────────
const serializeRequest = (x) =>
  x && {
    id: x.request_id,
    status: x.status,
    reason: x.reason,
    requestedAt: x.requested_at,
    decidedAt: x.decided_at,
    decisionNote: x.decision_note,
  };

r.get(
  '/privacy/deletion',
  wrap(async (req, res) => {
    const x = await one('SELECT * FROM account_deletion_requests WHERE user_id = ? ORDER BY request_id DESC LIMIT 1', [req.user.id]);
    const active = await one(
      "SELECT COUNT(*) AS n FROM applications WHERE applicant_id = ? AND status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')",
      [req.user.id],
    );
    res.json({ request: serializeRequest(x), activeApplications: Number(active.n) });
  }),
);

r.post(
  '/privacy/deletion',
  wrap(async (req, res) => {
    const d = parse(
      z.object({
        password: z.string().min(1, 'Нууц үгээ оруулна уу.').max(256),
        reason: z
          .string()
          .trim()
          .max(500)
          .optional()
          .transform((s) => s || null),
      }),
      req.body,
    );
    await confirmPassword(req, d.password);
    const id = await tx(async (q) => {
      await q('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [req.user.id]);
      const pending = (
        await q("SELECT request_id FROM account_deletion_requests WHERE user_id = ? AND status = 'PENDING'", [req.user.id])
      )[0];
      if (pending) throw conflict('Таны устгах хүсэлт хянагдаж байна.');
      const ins = await q('INSERT INTO account_deletion_requests (user_id, reason) VALUES (?, ?)', [req.user.id, d.reason]);
      await audit(req, { action: 'DELETION_REQUEST', entityType: 'deletion_request', entityKey: ins.insertId }, q);
      const admins = await q(
        "SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code = 'ADMIN' AND u.is_active = 1",
      );
      for (const a of admins) await notify(q, { userId: a.user_id, kind: 'DELETION_REQUESTED', ref: `DEL-${ins.insertId}` });
      return ins.insertId;
    });
    kickMailer();
    res.status(201).json({ id });
  }),
);

r.delete(
  '/privacy/deletion',
  wrap(async (req, res) => {
    const n = await query("UPDATE account_deletion_requests SET status = 'CANCELLED' WHERE user_id = ? AND status = 'PENDING'", [
      req.user.id,
    ]);
    if (!n.affectedRows) throw notFound('Хүлээгдэж буй хүсэлт алга.');
    await audit(req, { action: 'DELETION_CANCEL', entityType: 'user', entityKey: req.user.id });
    res.json({ ok: true });
  }),
);

export default r;
