import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

const app = createApp();
app.listen(config.port, () => {
  logger.info({ env: config.env, port: config.port }, `Цахим виз сервер: http://localhost:${config.port}`);
});

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
