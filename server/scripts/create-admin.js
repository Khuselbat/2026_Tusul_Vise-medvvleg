// Анхны (эсвэл нэмэлт) админ үүсгэх — production-д seed ашиглахгүй тул энэ скриптээр эхлүүлнэ.
//   npm run user:create-admin -- --email admin@example.mn --name "Админ"
// Нууц үг: ADMIN_PASSWORD орчны хувьсагчаас; байхгүй бол санамсаргүй үүсгэж НЭГ удаа хэвлэнэ.
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, tx } from '../src/db.js';
import { audit } from '../src/lib/audit.js';
import { passwordSchema, BCRYPT_ROUNDS } from '../src/routes/auth.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });

try {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .email('Имэйл буруу байна (--email).')
    .parse(values.email ?? '');
  const name = z
    .string()
    .trim()
    .min(2, 'Нэр оруулна уу (--name).')
    .max(150)
    .parse(values.name ?? '');
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || `${crypto.randomBytes(12).toString('base64url')}9a`;
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(`ADMIN_PASSWORD: ${pw.error.issues[0].message}`);

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await tx(async (q) => {
    const exists = await q('SELECT 1 FROM users WHERE email = ?', [email]);
    if (exists.length) throw new Error('Энэ имэйлээр бүртгэл аль хэдийн байна.');
    const ins = await q(
      `INSERT INTO users (public_id, role_id, email, password_hash, display_name)
       VALUES (?, (SELECT role_id FROM roles WHERE code = 'ADMIN'), ?, ?, ?)`,
      [crypto.randomUUID(), email, hash, name],
    );
    await audit(
      { id: crypto.randomUUID(), user: null },
      { action: 'ADMIN_BOOTSTRAP', entityType: 'user', entityKey: ins.insertId, actorId: null },
      q,
    );
  });
  console.log(`Админ үүслээ: ${email}`);
  if (generated) console.log(`Түр нууц үг (нэг удаа харагдана, нэвтэрсний дараа солино уу): ${password}`);
} catch (e) {
  console.error(e instanceof z.ZodError ? e.issues[0].message : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
