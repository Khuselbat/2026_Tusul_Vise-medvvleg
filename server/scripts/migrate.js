// Хэрэгжээгүй migration-уудыг ажиллуулна. Одоо байгаа өгөгдлийг УСТГАХГҮЙ — production-д аюулгүй.
//   npm run db:migrate
import { migrate } from '../src/lib/migrations.js';
import { config } from '../src/config.js';

try {
  const done = await migrate({ log: (m) => console.log(m) });
  console.log(done.length ? `${done.length} migration хэрэгжлээ: ${config.db.database}` : `Схем шинэчлэгдсэн байна: ${config.db.database}`);
} catch (e) {
  console.error(`Migration амжилтгүй: ${e.message}`);
  process.exitCode = 1;
}
