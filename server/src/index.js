import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { startMailWorker, dispatchPending } from './lib/notify.js';

const app = createApp();
app.listen(config.port, () => {
  logger.info({ env: config.env, port: config.port }, `Цахим виз сервер: http://localhost:${config.port}`);
});

// Мэдэгдлийн имэйлийн outbox: эхлэхдээ болон тогтмол хугацаанд дахин оролдоно
startMailWorker();
dispatchPending().catch((err) => logger.error({ err }, 'initial mail dispatch failed'));
if (config.isProd && !config.appUrl) logger.warn('APP_URL тохируулаагүй — имэйл доторх холбоос буруу болно.');

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
