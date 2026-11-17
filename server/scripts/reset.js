// АНХААР: сангийн БҮХ хүснэгтийг устгаад migration-уудыг дахин ажиллуулна.
// Зөвхөн хөгжүүлэлт/тестэд. NODE_ENV=production үед татгалзана.
//   npm run db:reset   (= reset + seed)
import { resetDatabase } from '../src/lib/migrations.js';
import { config } from '../src/config.js';

try {
  const done = await resetDatabase({ log: (m) => console.log(m) });
  console.log(`Схем дахин үүслээ (${done.length} migration): ${config.db.database}`);
} catch (e) {
  console.error(`Reset амжилтгүй: ${e.message}`);
  process.exitCode = 1;
}
