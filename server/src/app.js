import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './lib/errors.js';
import { logger as defaultLogger, httpLogger } from './lib/logger.js';
import { loadUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import applicantRoutes from './routes/applicant.js';
import fileRoutes from './routes/files.js';
import operatorRoutes from './routes/operator.js';
import adminRoutes from './routes/admin.js';
import supplementRoutes from './routes/supplements.js';
import officialResultRoutes from './routes/officialResults.js';
import importRoutes from './routes/imports.js';
import notificationRoutes from './routes/notifications.js';
import privacyRoutes from './routes/privacy.js';
import privacyAdminRoutes from './routes/privacyAdmin.js';

export function createApp({ logger = defaultLogger } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // NFR-03: HTTPS-ээс өөр сувгаар хувийн агуулга дамжуулахгүй
  if (config.forceHttps) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      return res.status(403).json({ error: { code: 'HTTPS_REQUIRED', message: 'Зөвхөн HTTPS-ээр хандана уу.' } });
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Request id (X-Request-Id) + хүсэлт бүрийн бүтэцтэй лог
  app.use(httpLogger(logger));
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  // CSRF хамгаалалт: cookie SameSite=Strict + өөрчлөх хүсэлтэд JSON эсвэл multipart л зөвшөөрнө
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const ct = req.headers['content-type'] || '';
      const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
      if (hasBody && !ct.startsWith('application/json') && !ct.startsWith('multipart/form-data')) {
        return res.status(415).json({ error: { code: 'UNSUPPORTED', message: 'Хүсэлтийн төрөл буруу.' } });
      }
      if (req.headers['x-requested-with'] !== 'civiz') {
        return res.status(403).json({ error: { code: 'CSRF', message: 'Хүсэлтийг баталгаажуулж чадсангүй.' } });
      }
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(loadUser);

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api', publicRoutes);
  app.use('/api/app', applicantRoutes);
  app.use('/api/app', supplementRoutes);
  app.use('/api/app', officialResultRoutes);
  app.use('/api/app', importRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/app', privacyRoutes);
  app.use('/api/admin', privacyAdminRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/operator', operatorRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API олдсонгүй.' } }));

  // Production: React-ийн build-ийг ижил origin-оос үйлчилнэ
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details || {}) } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Хүсэлтийн өгөгдөл буруу.' } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Хүсэлт хэт том байна.' } });
    }
    // Логт нууц мэдээлэл бичихгүй — safeError нь SQL алдааны утгыг хасна (lib/logger.js)
    req.log.error({ err }, 'unhandled error');
    return res
      .status(500)
      .json({ error: { code: 'SERVER_ERROR', message: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.', requestId: req.id } });
  });

  return app;
}
