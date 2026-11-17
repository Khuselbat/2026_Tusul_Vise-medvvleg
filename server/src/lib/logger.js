// Бүтэцтэй лог (pino). CLAUDE.md дүрэм 3: нууц үг, паспорт, анкетын агуулга, файлын зам,
// cookie/токеныг логт ХЭЗЭЭ Ч бичихгүй. Хүсэлтийн биеийг (body) огт логлохгүй.
import crypto from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from '../config.js';

const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password', '*.newPassword', '*.currentPassword', '*.passportNumber', '*.token',
];

/** URL-аас query string хасна (хайлтын утга, лавлах дугаар г.м. логт үлдэхгүй). */
const pathOnly = (url = '') => String(url).split('?')[0];

/**
 * Алдааг аюулгүй хэлбэрт оруулна. MySQL алдааны мессеж/`sql` талбарт утга (имэйл, hash г.м.)
 * орж болох тул SQL алдаанаас зөвхөн код, errno үлдээнэ.
 */
export function safeError(err) {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const isSql = 'sqlState' in err || 'sqlMessage' in err || 'sql' in err;
  return {
    type: err.name || 'Error',
    code: err.code,
    ...(isSql ? { errno: err.errno, sqlState: err.sqlState } : { message: err.message }),
    stack: isSql ? undefined : err.stack,
  };
}

export function createLogger({ destination, level } = {}) {
  const opts = {
    level: level || process.env.LOG_LEVEL || (config.isTest ? 'silent' : 'info'),
    base: { service: 'civiz' },
    redact: { paths: REDACT, censor: '[REDACTED]' },
    serializers: { err: safeError },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (destination) return pino(opts, destination);
  // Хөгжүүлэлтэд уншихад хялбар; production-д JSON мөр (лог цуглуулагчид)
  if (!config.isProd && !config.isTest && process.env.LOG_PRETTY !== '0') {
    return pino({ ...opts, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service,req,res,responseTime,userId,role' } } });
  }
  return pino(opts);
}

export const logger = createLogger();

/** Хүсэлт бүрд request id (UUID) олгож, X-Request-Id толгойгоор буцаана; дууссан хүсэлтийг нэг мөрөөр логлоно. */
export function httpLogger(log = logger) {
  return pinoHttp({
    logger: log,
    genReqId: (req, res) => {
      const id = crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customProps: (req) => ({ userId: req.user?.id ?? null, role: req.user?.role ?? null }),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: pathOnly(req.originalUrl || req.url) }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: safeError,
    },
    customSuccessMessage: (req, res, ms) => `${req.method} ${pathOnly(req.originalUrl || req.url)} ${res.statusCode}${ms === undefined ? '' : ` ${ms}ms`}`,
    customErrorMessage: (req, res) => `${req.method} ${pathOnly(req.originalUrl || req.url)} ${res.statusCode}`,
  });
}
