// Үе 3 — мэдүүлэгчийн хувийн мэдээлэл: бүх мэдээллээ ZIP-ээр татах, бүртгэл устгах хүсэлт (тайлан 4.5).
// Хоёулаа нууц үгээ дахин оруулж баталгаажуулна (сесс хулгайлагдсан үед мэдээлэл алдагдахаас хамгаална).
import { Router } from 'express';
import { createZip } from '../lib/zip.js';
import { verifyPassword } from '../lib/password.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db.js';
import { wrap, parse, badRequest, conflict, notFound, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { readFile, safeFileName } from '../lib/storage.js';
import { APP_SELECT, loadApplicationDetail, serializeEvidence, OUTCOME_LABEL } from '../lib/applications.js';
import { notify, kickMailer, render } from '../lib/notify.js';
import { requireRole } from '../middleware/auth.js';

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

const README = `Цахим виз — таны хувийн мэдээллийн хуулбар
==========================================
profile.json              — бүртгэлийн мэдээлэл
applications/<дугаар>/    — мэдүүлэг бүрийн анкет (паспортын дугаар бүтнээр), үнэлгээ, нэмэлт багц,
                            хүргүүлсэн бүртгэл, албан үр дүн; files/ — хавсралт, evidence/ — нотолгоо
imports/<дугаар>/         — таны импортолсон өмнөх мэдүүлгүүд
notifications.json        — мэдэгдлүүд

Энэ файлд паспортын дугаар зэрэг нууц мэдээлэл бий — найдвартай хадгална уу.
Дотоод лавлах дугаар нь консулын визийн дугаар биш. Бүрдлийн үнэлгээ нь визийн шийдвэр биш.
Вирусын шалгалтад тэнцээгүй эсвэл шалгагдаж буй файлыг оруулаагүй (json-д тэмдэглэсэн).
`;

const json = (x) => JSON.stringify(x, null, 2);

// Бүх мэдээллээ ZIP-ээр татах (POST — нууц үгтэй; CSRF толгой заавал)
r.post(
  '/privacy/export',
  exportLimiter,
  wrap(async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1, 'Нууц үгээ оруулна уу.').max(256) }), req.body);
    await confirmPassword(req, password);

    const user = await one('SELECT email, display_name, created_at, email_verified_at FROM users WHERE user_id = ?', [req.user.id]);
    const apps = await query(`${APP_SELECT} WHERE a.applicant_id = ? ORDER BY a.created_at`, [req.user.id]);
    const imports = await query('SELECT * FROM imported_applications WHERE applicant_id = ? ORDER BY applied_on', [req.user.id]);
    const notes = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id', [req.user.id]);
    await audit(req, { action: 'DATA_EXPORT', entityType: 'user', entityKey: req.user.id });

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="civiz-export-${stamp}.zip"`,
      'Cache-Control': 'private, no-store',
    });
    const zip = createZip(res);
    res.on('error', (err) => logger.error({ err }, 'export stream failed'));

    const addFile = async (dir, f, id) => {
      if ((f.scan_status ?? 'ACCEPTED') !== 'ACCEPTED') return { included: false, reason: f.scan_status };
      try {
        const buf = await readFile(f.storage_key);
        await zip.add(`${dir}/${id}-${safeFileName(f.original_name)}`, buf);
        return { included: true };
      } catch {
        return { included: false, reason: 'MISSING' };
      }
    };

    await zip.add('README.txt', README);
    await zip.add(
      'profile.json',
      json({
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
        emailVerifiedAt: user.email_verified_at,
        exportedAt: new Date(),
      }),
    );

    for (const a of apps) {
      const d = await loadApplicationDetail(a, { revealPassport: true, viewer: 'APPLICANT' });
      const base = `applications/${a.public_id}`;
      const docs = await query('SELECT * FROM application_documents WHERE application_id = ? ORDER BY document_id', [a.application_id]);
      const files = [];
      for (const f of docs)
        files.push({ id: f.document_id, name: f.original_name, sha256: f.sha256, ...(await addFile(`${base}/files`, f, f.document_id)) });
      const ev = await query('SELECT * FROM evidence_files WHERE application_id = ? ORDER BY file_id', [a.application_id]);
      const evidence = [];
      for (const f of ev) evidence.push({ ...serializeEvidence(f), ...(await addFile(`${base}/evidence`, f, f.file_id)) });
      // Ажилтны нэрийг (бусдын хувийн мэдээлэл) оруулахгүй
      const strip = ({ operatorName: _o, ...x }) => x;
      await zip.add(
        `${base}/application.json`,
        json({
          ...d,
          operatorName: undefined,
          reviews: d.reviews.map(strip),
          handover: d.handover && strip(d.handover),
          officialResults: d.officialResults.map((x) => ({ ...x, verification: x.verification && strip(x.verification) })),
          files,
          evidence,
        }),
      );
    }

    for (const x of imports) {
      const base = `imports/${x.public_id}`;
      const ev = await query('SELECT * FROM evidence_files WHERE import_id = ? ORDER BY file_id', [x.import_id]);
      const files = [];
      for (const f of ev) files.push({ ...serializeEvidence(f), ...(await addFile(`${base}/files`, f, f.file_id)) });
      await zip.add(
        `${base}/import.json`,
        json({
          publicId: x.public_id,
          countryName: x.country_name,
          visaCategory: x.visa_category,
          appliedOn: x.applied_on,
          authority: x.authority,
          officialRef: x.official_ref,
          outcome: OUTCOME_LABEL[x.outcome],
          note: x.note,
          imported: true,
          verified: false,
          files,
        }),
      );
    }
    await zip.add('notifications.json', json(notes.map(render)));
    await zip.finish();
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
