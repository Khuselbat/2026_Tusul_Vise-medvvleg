// E2E-д зориулсан сервер: civiz_test санг цэвэрлэж (migration + жишээ хэрэглэгч, мэдүүлэггүй),
// client/dist-ийг үйлчилнэ. Playwright-ийн webServer энэ скриптийг ажиллуулна.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.E2E_PORT || '4100';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
await resetDatabase();
await seed({ withDemoApplications: false });
createApp().listen(config.port, '127.0.0.1', () => console.log(`E2E сервер: http://127.0.0.1:${config.port} (${config.db.database})`));
