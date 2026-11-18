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

/**
 * Илгээлтийн алдаа — хэрэглэгчид ойлгомжтой монгол мессеж, админд оношлох код. SMTP-ийн нууц үг, серверийн
 * хариуны бүтэн текст (хаяг, нэвтрэх нэр агуулж болно) мессежид орохгүй.
 */
export class MailError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'MailError';
    this.code = code;
    this.cause = cause;
  }
}

const MAIL_ERRORS = {
  MAIL_NOT_CONFIGURED: 'Имэйл илгээх тохиргоо (SMTP) хийгдээгүй байна.',
  MAIL_AUTH: 'SMTP серверт нэвтэрч чадсангүй — SMTP_USER / SMTP_PASS (Gmail бол App Password)-ыг шалгана уу.',
  MAIL_CONNECTION: 'SMTP сервертэй холбогдож чадсангүй — SMTP_HOST, SMTP_PORT, SMTP_SECURE, интернэт холболтыг шалгана уу.',
  MAIL_REJECTED: 'SMTP сервер захидлыг хүлээн авсангүй — MAIL_FROM хаяг SMTP_USER-тэй таарч буй эсэхийг шалгана уу.',
  MAIL_FAILED: 'Имэйл илгээхэд алдаа гарлаа.',
};

export function classifyMailError(err) {
  if (err instanceof MailError) return err;
  const c = err?.code || '';
  const code =
    c === 'EAUTH' || err?.responseCode === 535
      ? 'MAIL_AUTH'
      : ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'ETLS'].includes(c)
        ? 'MAIL_CONNECTION'
        : c === 'EENVELOPE' || (err?.responseCode >= 500 && err?.responseCode < 600)
          ? 'MAIL_REJECTED'
          : 'MAIL_FAILED';
  return new MailError(code, MAIL_ERRORS[code], err);
}

let transport = null;
let transportKey = '';
let etherealInfo = null;

async function getTransport() {
  const t = config.mail.transport;
  const s = config.mail.smtp;
  const key = `${t}|${s.host}|${s.port}|${s.secure}|${s.user}`;
  if (transport && transportKey === key) return transport;
  if (t === 'smtp') {
    if (!s.host) throw new MailError('MAIL_NOT_CONFIGURED', MAIL_ERRORS.MAIL_NOT_CONFIGURED);
    transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  } else if (t === 'ethereal') {
    // Туршилтын SMTP (https://ethereal.email): захидал жинхэнэ хаяг руу явахгүй, вэб дээр харагдана
    etherealInfo ??= await nodemailer.createTestAccount();
    transport = nodemailer.createTransport({
      host: etherealInfo.smtp.host,
      port: etherealInfo.smtp.port,
      secure: etherealInfo.smtp.secure,
      auth: { user: etherealInfo.user, pass: etherealInfo.pass },
    });
  } else {
    // file / console / memory / log — бодит сүлжээ ашиглахгүй
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  transportKey = key;
  return transport;
}

const maskEmail = (e) => String(e).replace(/^(.).*(@.*)$/, '$1***$2');

/**
 * Хөгжүүлэлтийн орчинд (SMTP-гүй) захидлын холбоосыг консолд тод хэвлэнэ — production, тестэд хэзээ ч.
 * Токентой холбоос тул pino логт бичихгүй, зөвхөн терминалд.
 */
function printDevMail({ to, subject, text }, extra) {
  if (config.isProd || config.isTest) return;
  const links = String(text).match(/https?:\/\/\S+/g) || [];
  const bar = '═'.repeat(72);
  process.stdout.write(
    `\n\x1b[33m${bar}\n  📧 ИМЭЙЛ (${config.mail.transport} — жинхэнэ хаяг руу ЯВААГҮЙ)\n  Хэнд: ${to}\n  Гарчиг: ${subject}\n` +
      links.map((l) => `  👉 ${l}\n`).join('') +
      (extra ? `  ${extra}\n` : '') +
      `${bar}\x1b[0m\n\n`,
  );
}

/** Нэг захидал илгээнэ. Алдаа гарвал MailError шиднэ (код + монгол мессеж). */
export async function sendMail({ to, subject, text, html }) {
  const t = config.mail.transport;
  let info;
  try {
    info = await (await getTransport()).sendMail({ from: config.mail.from, to, subject, text, html });
  } catch (err) {
    const e = classifyMailError(err);
    logger.warn({ to: maskEmail(to), transport: t, code: e.code, smtpCode: err?.code, responseCode: err?.responseCode }, 'mail failed');
    throw e;
  }
  if (t === 'memory') outbox.push({ to, subject, text, html });
  if (t === 'file') {
    await fs.mkdir(config.mail.outboxDir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.eml`;
    await fs.writeFile(path.join(config.mail.outboxDir, name), info.message);
    // Уншихад хялбар хуулбар (dev, E2E) — .eml нь MIME кодлогдсон байдаг
    await fs.writeFile(path.join(config.mail.outboxDir, name.replace(/\.eml$/, '.json')), JSON.stringify({ to, subject, text }, null, 2));
    printDevMail({ to, subject, text }, `Хуулбар: ${path.join(config.mail.outboxDir, name.replace(/\.eml$/, '.json'))}`);
  }
  if (t === 'console') printDevMail({ to, subject, text });
  let previewUrl = null;
  if (t === 'ethereal') {
    previewUrl = nodemailer.getTestMessageUrl(info) || null;
    printDevMail({ to, subject, text }, `Ethereal дээр харах: ${previewUrl}`);
  }
  logger.info({ to: maskEmail(to), subject, transport: t }, 'mail sent');
  return { transport: t, previewUrl };
}

/** Тохиргооны тойм (админд) — нууц үг, нэвтрэх нэрийн бүтэн утга орохгүй */
export function mailStatus() {
  const s = config.mail.smtp;
  const t = config.mail.transport;
  return {
    transport: t,
    delivers: t === 'smtp' || t === 'ethereal',
    configured: t !== 'smtp' || !!s.host,
    host: t === 'smtp' ? s.host || null : null,
    port: t === 'smtp' ? s.port : null,
    secure: t === 'smtp' ? s.secure : null,
    user: t === 'smtp' && s.user ? maskEmail(s.user) : null,
    passwordSet: t === 'smtp' ? !!s.pass : null,
    from: config.mail.from,
    appUrl: config.appUrl,
  };
}

/**
 * Имэйл илгээх боломжтой эсэх (нууц үг сэргээх хүсэлтэд урьдчилан шалгана). SMTP бол transport.verify()-г 60 сек кэшлэнэ.
 * Хэрэглэгчээс хамаарахгүй тул хариугаар бүртгэл таагдахгүй.
 */
let readyCache = { at: 0, error: null };
export async function mailReady() {
  if (config.mail.transport !== 'smtp') return null;
  if (Date.now() - readyCache.at < 60_000) return readyCache.error;
  let error = null;
  try {
    await (await getTransport()).verify();
  } catch (err) {
    error = classifyMailError(err);
    logger.warn({ code: error.code, smtpCode: err?.code }, 'mail transport not ready');
  }
  readyCache = { at: Date.now(), error };
  return error;
}
export const resetMailReadyCache = () => {
  readyCache = { at: 0, error: null };
};

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
        'Таны бүртгэлд нууц үг сэргээх хүсэлт ирлээ. Доорх холбоос 1 цагийн дотор, нэг удаа хүчинтэй.',
        'Хэрэв та хүсэлт гаргаагүй бол энэ захидлыг үл тооно уу — таны нууц үг өөрчлөгдөхгүй.',
      ],
      link,
      'Шинэ нууц үг тохируулах',
    ),
  };
}
