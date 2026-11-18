// Ачааллын туршилтын бэлтгэл: N зохиомол мэдүүлэгч (load-001@load.invalid …) үүсгэнэ. Production санд ХЭЗЭЭ Ч биш.
//   cd server
//   DB_NAME=civiz_load npm run db:reset                          # тусдаа сан + жишээ визийн мэдээлэл
//   DB_NAME=civiz_load node scripts/loadtest-prepare.js --users 100
// Docker image-д ороогүй (.dockerignore).
// Бүгд ижил нууц үгтэй (LOAD_PASSWORD) — bcrypt хэшийг production-ийн cost (12)-оор нэг удаа бодож дахин ашиглана.
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query, one } from '../src/db.js';
import { BCRYPT_ROUNDS } from '../src/routes/auth.js';

export const LOAD_PASSWORD = process.env.LOAD_PASSWORD || 'LoadTest1234';
export const loadEmail = (i) => `load-${String(i).padStart(3, '0')}@load.invalid`;

const { values } = parseArgs({ options: { users: { type: 'string', default: '100' } } });
const n = Number(values.users);

try {
  if (config.isProd) throw new Error('Ачааллын туршилтын хэрэглэгчийг production орчинд үүсгэхгүй.');
  if (!/load|test/i.test(config.db.database))
    throw new Error(`DB_NAME="${config.db.database}" — тусдаа (нэрэндээ load/test агуулсан) сан ашиглана уу.`);
  const role = await one("SELECT role_id FROM roles WHERE code = 'APPLICANT'");
  if (!(await one('SELECT 1 AS ok FROM visa_info_versions WHERE published_at IS NOT NULL LIMIT 1'))) {
    throw new Error('Нийтэлсэн визийн мэдээлэл алга — эхлээд `npm run db:reset` (жишээ өгөгдөл).');
  }
  const hash = await bcrypt.hash(LOAD_PASSWORD, BCRYPT_ROUNDS);
  const rows = Array.from({ length: n }, (_, i) => [
    crypto.randomUUID(),
    role.role_id,
    loadEmail(i + 1),
    hash,
    `Load User ${i + 1}`,
    new Date(),
  ]);
  // Дахин ажиллуулахад одоо байгааг ашиглана (нууц үгийг л шинэчилнэ)
  await query(
    `INSERT INTO users (public_id, role_id, email, password_hash, display_name, email_verified_at) VALUES ?
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [rows],
  );
  console.log(`${n} туршилтын мэдүүлэгч үүслээ (${config.db.database}, bcrypt cost ${BCRYPT_ROUNDS}).`);
} catch (e) {
  console.error(`Бэлтгэл амжилтгүй: ${e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
