// Систем доторх мэдэгдэл (хонх) + имэйлийн outbox (Үе 2).
// notify() нь бизнесийн транзакц ДОТОР мөр нэмнэ (найдвартай); имэйлийг commit-ийн дараа dispatchPending() илгээнэ,
// амжилтгүй бол worker дахин оролдоно (≤5). Текстийг хадгалахгүй — kind + лавлах дугаараас үүсгэнэ.
import { config } from '../config.js';
import { query, withLock } from '../db.js';
import { logger } from './logger.js';
import { sendMail, url } from './mailer.js';

const MAX_ATTEMPTS = 5;
const appLink = (ref) => `/app/applications/${ref}`;
const opLink = (ref) => `/operator/applications/${ref}`;

/** Мэдэгдлийн төрөл → гарчиг, текст, холбоос. Хувийн мэдээлэл (нэр, тайлбар, паспорт) оруулахгүй. */
export const KINDS = {
  APP_SUBMITTED: {
    title: 'Мэдүүлэг хүлээн авлаа',
    body: (ref) => `Таны ${ref} дугаартай мэдүүлэг архивлагдаж, бүрдлийн хяналтад шилжлээ.`,
    link: appLink,
  },
  APP_ASSIGNED: {
    title: 'Танд мэдүүлэг хуваарилагдлаа',
    body: (ref) => `${ref} дугаартай мэдүүлгийн бүрдлийг шалгана уу.`,
    link: opLink,
  },
  REVIEW_INCOMPLETE: {
    title: 'Нэмэлт материал шаардлагатай',
    body: (ref) => `${ref} мэдүүлэгт оператор нэмэлт материал шаардлаа. Дэлгэрэнгүйг системд нэвтэрч үзнэ үү. Энэ нь визийн шийдвэр биш.`,
    link: appLink,
  },
  REVIEW_COMPLETE: {
    title: 'Бүрдэл бүрэн',
    body: (ref) => `${ref} мэдүүлгийн материалын бүрдэл бүрэн гэж үнэлэгдлээ. Энэ нь визийн шийдвэр биш.`,
    link: appLink,
  },
  SUPPLEMENT_SUBMITTED: {
    title: 'Нэмэлт материал ирлээ',
    body: (ref) => `${ref} мэдүүлэгт мэдүүлэгч нэмэлт материал илгээлээ.`,
    link: opLink,
  },
  DELETION_REQUESTED: {
    title: 'Бүртгэл устгах хүсэлт ирлээ',
    body: (ref) => `${ref} — мэдүүлэгч бүртгэлээ устгахыг хүссэн. Шийдвэрлэнэ үү.`,
    link: () => '/admin/deletion-requests',
  },
  HANDOVER_RECORDED: {
    title: 'Эрх бүхий байгууллагад хүргүүлсэн',
    body: (ref) => `${ref} мэдүүлгийн материалыг хүргүүлсэн. Албан ёсны хариуг Korea Visa Portal-аас шалгана уу.`,
    link: appLink,
  },
};

/** Транзакц дотор мэдэгдэл нэмнэ (`q`). userId байхгүй бол алгасна. */
export async function notify(q, { userId, kind, applicationId = null, ref = null }) {
  if (!userId) return;
  if (!KINDS[kind]) throw new Error(`Unknown notification kind: ${kind}`);
  await q('INSERT INTO notifications (user_id, kind, application_id, ref) VALUES (?,?,?,?)', [userId, kind, applicationId, ref]);
}

export function render(n) {
  const k = KINDS[n.kind];
  return {
    id: n.notification_id,
    kind: n.kind,
    title: k?.title || n.kind,
    body: k && n.ref ? k.body(n.ref) : '',
    link: k && n.ref ? k.link(n.ref) : null,
    ref: n.ref,
    createdAt: n.created_at,
    readAt: n.read_at,
  };
}

let running = false;
/**
 * Илгээгдээгүй имэйлүүдийг илгээнэ. Хүлээн авагч идэвхгүй эсвэл имэйл баталгаажаагүй бол SKIPPED
 * (баталгаажаагүй хаяг руу мэдээлэл явуулахгүй).
 */
export async function dispatchPending({ limit = 50 } = {}) {
  if (running) return 0;
  running = true;
  try {
    // Үе 5 (D-30): олон инстанс зэрэг ажиллахад нэг имэйлийг давхар илгээхгүй — нэг л инстанс outbox-ийг боловсруулна
    const r = await withLock('civiz_mailer', () => dispatchBatch(limit));
    return r.acquired ? r.result : 0;
  } finally {
    running = false;
  }
}

async function dispatchBatch(limit) {
  let sent = 0;
  const rows = await query(
    `SELECT n.*, u.email, u.is_active, u.email_verified_at FROM notifications n JOIN users u ON u.user_id = n.user_id
        WHERE n.email_status = 'PENDING' ORDER BY n.notification_id LIMIT ?`,
    [limit],
  );
  for (const n of rows) {
    if (!n.is_active || !n.email_verified_at) {
      await query("UPDATE notifications SET email_status = 'SKIPPED' WHERE notification_id = ?", [n.notification_id]);
      continue;
    }
    const r = render(n);
    try {
      const lines = [r.body, 'Мэдэгдлийг системийн хонхноос ч харж болно.'];
      const link = r.link ? url(r.link) : null;
      const text = [r.title, '', ...lines, '', link ? `Нээх: ${link}` : ''].join('\n');
      await sendMail({ to: n.email, subject: r.title, text });
      await query("UPDATE notifications SET email_status = 'SENT', emailed_at = CURRENT_TIMESTAMP(6) WHERE notification_id = ?", [
        n.notification_id,
      ]);
      sent += 1;
    } catch (err) {
      const attempts = n.email_attempts + 1;
      await query('UPDATE notifications SET email_attempts = ?, email_status = ? WHERE notification_id = ?', [
        attempts,
        attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        n.notification_id,
      ]);
      logger.warn({ err, notificationId: n.notification_id, attempts }, 'notification email failed');
    }
  }
  return sent;
}

/** Commit-ийн дараа дуудна: имэйлийг хүсэлтийг удаашруулахгүйгээр ар талд илгээнэ (тестэд гараар). */
export function kickMailer() {
  if (config.isTest) return;
  setImmediate(() => dispatchPending().catch((err) => logger.error({ err }, 'mail dispatch failed')));
}

export function startMailWorker() {
  if (config.isTest) return null;
  const t = setInterval(() => dispatchPending().catch((err) => logger.error({ err }, 'mail worker failed')), config.mail.workerIntervalMs);
  t.unref();
  return t;
}
