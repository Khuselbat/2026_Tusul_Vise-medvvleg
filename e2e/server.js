// E2E-д зориулсан сервер: civiz_test санг цэвэрлэж (migration + жишээ хэрэглэгч, мэдүүлэггүй),
// client/dist-ийг үйлчилнэ. Playwright-ийн webServer энэ скриптийг ажиллуулна.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
// Имэйлийг файлаар (e2e/.mail/*.json) — тест баталгаажуулах/сэргээх холбоосыг эндээс уншина
process.env.MAIL_TRANSPORT = 'file';
process.env.PORT = process.env.E2E_PORT || '4100';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { MAIL_DIR, E2E_MFA_SECRET } = await import('./helpers.js');
process.env.MAIL_OUTBOX_DIR = MAIL_DIR;
if (!fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))) {
  console.error('client/dist олдсонгүй. Эхлээд: cd client && npm run build');
  process.exit(1);
}

// NODE_ENV-ийг тохируулсны дараа серверийн модулиудыг ачаална (config нь импорт хийх үед уншина)
const { resetDatabase } = await import('../server/src/lib/migrations.js');
const { seed } = await import('../server/scripts/seed.js');
const { createApp } = await import('../server/src/app.js');
const { config } = await import('../server/src/config.js');

fs.rmSync(config.storageDir, { recursive: true, force: true });
fs.rmSync(MAIL_DIR, { recursive: true, force: true });
await resetDatabase();
// Ажилтан урьдчилан тохируулсан 2FA-тай (VERIFY горим); бүртгэлийн урсгалыг stage2.spec-д MFA reset-ээр шалгана
// E2E_DEMO_APPS=1 — жишээ мэдүүлэгтэй (docs:screenshots)
await seed({ withDemoApplications: process.env.E2E_DEMO_APPS === '1', staffMfaSecret: E2E_MFA_SECRET });
createApp().listen(config.port, '127.0.0.1', () => console.log(`E2E сервер: http://127.0.0.1:${config.port} (${config.db.database})`));
