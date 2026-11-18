import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './lib/logger.js';
import { startMailWorker, dispatchPending } from './lib/notify.js';
import { startScanWorker, processPendingScans, scannerEnabled } from './lib/scanner.js';
import { startRetentionWorker } from './lib/retention.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ env: config.env, port: config.port }, `Цахим виз сервер: http://localhost:${config.port}`);
});
// Reverse proxy (Caddy/nginx)-ийн keep-alive-аас урт байлгана — эс бөгөөс proxy хаагдсан холболт руу бичиж 502 гарна
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Мэдэгдлийн имэйлийн outbox: эхлэхдээ болон тогтмол хугацаанд дахин оролдоно
startMailWorker();
// Үе 3: вирус шалгалт (ClamAV) ба хадгалах хугацааны цэвэрлэгээ
startScanWorker();
if (scannerEnabled()) processPendingScans().catch((err) => logger.error({ err }, 'initial scan failed'));
startRetentionWorker();
dispatchPending().catch((err) => logger.error({ err }, 'initial mail dispatch failed'));
if (config.isProd && !config.appUrl) logger.warn('APP_URL тохируулаагүй — имэйл доторх холбоос буруу болно.');

// Үе 5: зогсоох дохио (docker stop, systemd) — шинэ холболт хүлээж авахаа больж, эхэлсэн хүсэлтүүдийг дуусгаад,
// DB холболтыг хаана. 10 секундэд дуусахгүй бол албадан гарна (Docker-ийн анхдагч stop_grace_period).
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(
    () => {
      logger.error('graceful shutdown timed out — forcing exit');
      process.exit(1);
    },
    Number(process.env.SHUTDOWN_TIMEOUT_MS || 9000),
  ).unref();
  server.close(async () => {
    await pool.end().catch(() => {});
    logger.info('stopped');
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
// Тодорхойгүй төлөвт үргэлжлүүлэхгүй: логлоод гарна, контейнер/systemd дахин эхлүүлнэ (restart: unless-stopped)
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
