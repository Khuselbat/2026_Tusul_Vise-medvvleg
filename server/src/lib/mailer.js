// Имэйл илгээх давхарга (nodemailer). Тээвэрлэлт: smtp (production) · file (dev, server/mail-outbox/*.eml) ·
// memory (тест — `outbox` массив) · log (зөвхөн хүлээн авагч/гарчгийг логлоно).
// Имэйлд нууц үг, паспорт, анкетын агуулга ХЭЗЭЭ Ч оруулахгүй — зөвхөн лавлах дугаар ба системийн холбоос.
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

/** Тестэд илгээгдсэн захидлуудыг шалгах */
export const outbox = [];

let transport;
function getTransport() {
  if (transport) return transport;
  const t = config.mail.transport;
  if (t === 'smtp') {
    if (!config.mail.smtp.host) throw new Error('SMTP_HOST тохируулаагүй байна.');
    transport = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: config.mail.smtp.secure,
      auth: config.mail.smtp.user ? { user: config.mail.smtp.user, pass: config.mail.smtp.pass } : undefined,
    });
  } else {
    // file / memory / log — бодит сүлжээ ашиглахгүй
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  return transport;
}

const maskEmail = (e) => String(e).replace(/^(.).*(@.*)$/, '$1***$2');

/** Нэг захидал илгээнэ. Алдаа гарвал шиднэ (outbox дахин оролдоно). */
export async function sendMail({ to, subject, text, html }) {
  const info = await getTransport().sendMail({ from: config.mail.from, to, subject, text, html });
  const t = config.mail.transport;
  if (t === 'memory') outbox.push({ to, subject, text, html });
  if (t === 'file') {
    await fs.mkdir(config.mail.outboxDir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.eml`;
    await fs.writeFile(path.join(config.mail.outboxDir, name), info.message);
    // Уншихад хялбар хуулбар (dev, E2E) — .eml нь MIME кодлогдсон байдаг
    await fs.writeFile(path.join(config.mail.outboxDir, name.replace(/\.eml$/, '.json')), JSON.stringify({ to, subject, text }, null, 2));
  }
  logger.info({ to: maskEmail(to), subject, transport: t }, 'mail sent');
}

/* ───────────── Загварууд (монгол, хувийн мэдээлэлгүй) ───────────── */

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(title, lines, link, linkLabel) {
  const footer = 'Энэ захидлыг Цахим виз систем автоматаар илгээв. Визийн шийдвэрийг эрх бүхий байгууллага гаргана.';
  const text = [title, '', ...lines, '', link ? `${linkLabel}: ${link}` : '', '', footer].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.5">
<h2 style="font-size:18px">${escape(title)}</h2>${lines.map((l) => `<p>${escape(l)}</p>`).join('')}
${link ? `<p><a href="${escape(link)}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(linkLabel)}</a></p><p style="font-size:12px;color:#52606d">${escape(link)}</p>` : ''}
<hr><p style="font-size:12px;color:#52606d">${escape(footer)}</p></body></html>`;
  return { text, html };
}

export const url = (p) => `${config.appUrl}${p}`;

export function verifyEmailMail(token) {
  const link = url(`/verify-email?token=${encodeURIComponent(token)}`);
  return {
    subject: 'Имэйл хаягаа баталгаажуулна уу',
    ...layout(
      'Имэйл баталгаажуулалт',
      ['Цахим виз системд бүртгүүлсэнд баярлалаа. Доорх холбоосоор имэйл хаягаа баталгаажуулна уу.', 'Холбоос 24 цагийн дотор хүчинтэй.'],
      link,
      'Имэйл баталгаажуулах',
    ),
  };
}

export function resetPasswordMail(token) {
  const link = url(`/reset-password?token=${encodeURIComponent(token)}`);
  return {
    subject: 'Нууц үг сэргээх',
    ...layout(
      'Нууц үг сэргээх хүсэлт',
      [
        'Таны бүртгэлд нууц үг сэргээх хүсэлт ирлээ. Доорх холбоос 30 минутын дотор, нэг удаа хүчинтэй.',
        'Хэрэв та хүсэлт гаргаагүй бол энэ захидлыг үл тооно уу — таны нууц үг өөрчлөгдөхгүй.',
      ],
      link,
      'Шинэ нууц үг тохируулах',
    ),
  };
}
