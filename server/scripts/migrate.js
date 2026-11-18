// Хэрэгжээгүй migration-уудыг ажиллуулна. Одоо байгаа өгөгдлийг УСТГАХГҮЙ — production-д аюулгүй.
//   npm run db:migrate
//   node scripts/migrate.js --wait 60   — DB бэлэн болохыг 60 сек хүртэл хүлээнэ (Docker эхлэх үед)
import { parseArgs } from 'node:util';
import mysql from 'mysql2/promise';
import { migrate } from '../src/lib/migrations.js';
import { config } from '../src/config.js';

const { values } = parseArgs({ options: { wait: { type: 'string', default: '0' } } });
const waitSec = Number(values.wait) || 0;

/** Холболт амжилттай болтол давтан оролдоно (DB контейнер эхэлж байх үед ECONNREFUSED / ER_ACCESS_DENIED түр гардаг). */
async function waitForDb(seconds) {
  const deadline = Date.now() + seconds * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      const conn = await mysql.createConnection({ ...config.db, connectTimeout: 5000 });
      await conn.end();
      return;
    } catch (e) {
      if (Date.now() >= deadline) throw e;
      if (attempt === 1 || attempt % 5 === 0) console.log(`Өгөгдлийн санг хүлээж байна… (${e.code || e.message})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

try {
  if (waitSec > 0) await waitForDb(waitSec);
  const done = await migrate({ log: (m) => console.log(m) });
  console.log(done.length ? `${done.length} migration хэрэгжлээ: ${config.db.database}` : `Схем шинэчлэгдсэн байна: ${config.db.database}`);
} catch (e) {
  console.error(`Migration амжилтгүй: ${e.message}`);
  process.exitCode = 1;
}
