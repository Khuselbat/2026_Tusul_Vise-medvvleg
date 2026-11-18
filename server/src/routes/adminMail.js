// Админ: имэйлийн (SMTP) тохиргоог шалгах — тохиргооны тойм, өөрийн хаяг руу туршилтын захидал.
// Нууц үг, SMTP серверийн бүтэн хариу хэзээ ч буцаахгүй. Зөвхөн админы өөрийн имэйл рүү (дурын хаяг руу спам илгээх боломжгүй).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { wrap, HttpError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { mailStatus, sendMail, resetMailReadyCache, MailError } from '../lib/mailer.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use('/mail', requireRole('ADMIN'));

const testLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  keyGenerator: (req) => `u${req.user.id}`,
  handler: (_req, _res, next) => next(new HttpError(429, 'TOO_MANY', 'Олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.')),
});

r.get(
  '/mail/status',
  wrap(async (_req, res) => {
    res.json(mailStatus());
  }),
);

r.post(
  '/mail/test',
  testLimiter,
  wrap(async (req, res) => {
    const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    try {
      const out = await sendMail({
        to: req.user.email,
        subject: 'Цахим виз — туршилтын имэйл',
        text: [
          'Энэ бол Цахим виз системийн туршилтын имэйл.',
          `Илгээсэн: ${at} UTC`,
          `Холбоосын үндэс (APP_BASE_URL): ${config.appUrl || '(тохируулаагүй)'}`,
          '',
          'Энэ захидал ирсэн бол имэйл баталгаажуулалт, нууц үг сэргээх захидлууд ч ирнэ.',
        ].join('\n'),
      });
      resetMailReadyCache();
      await audit(req, { action: 'MAIL_TEST', entityType: 'user', entityKey: req.user.id });
      res.json({ ok: true, to: req.user.email, ...out, delivers: mailStatus().delivers });
    } catch (err) {
      await audit(req, { action: 'MAIL_TEST_FAILED', entityType: 'user', entityKey: req.user.id });
      const e = err instanceof MailError ? err : new MailError('MAIL_FAILED', 'Имэйл илгээхэд алдаа гарлаа.');
      throw new HttpError(502, e.code, e.message);
    }
  }),
);

export default r;
