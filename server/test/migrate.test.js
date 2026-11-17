// Migration систем: зөвхөн хэрэгжээгүйг ажиллуулна, өгөгдөл устгахгүй, хэрэгжсэн файлын өөрчлөлтийг илрүүлнэ,
// reset/seed нь production-д татгалзана.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pool, query, one } from '../src/db.js';
import { migrate, resetDatabase, listMigrations, MIGRATIONS_DIR } from '../src/lib/migrations.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;

async function copyMigrations() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'civiz-mig-'));
  for (const f of await fs.readdir(MIGRATIONS_DIR)) await fs.copyFile(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
  return dir;
}

before(async () => { tmp = await copyMigrations(); });
after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  await resetDatabase(); // дараагийн тестэд цэвэр схем үлдээнэ
  await pool.end();
});

describe('Migration систем', () => {
  test('reset → бүх migration хэрэгжиж, schema_migrations-д бүртгэгдэнэ; дахин ажиллуулахад 0', async () => {
    const files = await listMigrations();
    const done = await resetDatabase();
    assert.deepEqual(done, files.map((f) => f.name));
    const rows = await query('SELECT version, checksum FROM schema_migrations ORDER BY version');
    assert.equal(rows.length, files.length);
    assert.equal(rows[0].version, '001');
    assert.deepEqual(await migrate(), []);
  });

  test('migrate өгөгдөл устгахгүй, зөвхөн шинэ файлыг ажиллуулна', async () => {
    await resetDatabase({ dir: tmp });
    await query("INSERT INTO countries (iso_code, name_mn, service_status) VALUES ('KR', 'БНСУ', 'ACTIVE')");
    await fs.writeFile(path.join(tmp, '900_test_extra.sql'),
      'CREATE TABLE zz_migration_probe (id INT PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n');
    try {
      assert.deepEqual(await migrate({ dir: tmp }), ['900_test_extra.sql']);
      assert.equal(Number((await one('SELECT COUNT(*) AS n FROM countries')).n), 1, 'өмнөх өгөгдөл хэвээр');
      assert.ok(await one("SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zz_migration_probe'"));
      assert.deepEqual(await migrate({ dir: tmp }), []);
    } finally {
      await fs.rm(path.join(tmp, '900_test_extra.sql'), { force: true });
    }
  });

  test('хэрэгжсэн migration-ийг өөрчилбөл зогсооно (CRLF ялгааг тооцохгүй)', async () => {
    await resetDatabase({ dir: tmp });
    const f = path.join(tmp, '001_init.sql');
    const orig = await fs.readFile(f, 'utf8');
    await fs.writeFile(f, orig.replace(/\r?\n/g, '\r\n'));
    assert.deepEqual(await migrate({ dir: tmp }), [], 'зөвхөн мөрийн төгсгөл өөрчлөгдсөн бол зөвшөөрнө');
    await fs.writeFile(f, `${orig}\n-- edited\n`);
    await assert.rejects(migrate({ dir: tmp }), /өөрчлөгдсөн/);
    await fs.writeFile(f, orig);
  });

  test('хуучин schema.sql-ээр үүссэн сан: 001-ийг baseline болгож, өгөгдөл хэвээр', async () => {
    await resetDatabase({ dir: tmp });
    await query("INSERT INTO countries (iso_code, name_mn, service_status) VALUES ('KR', 'БНСУ', 'ACTIVE')");
    await query('DROP TABLE schema_migrations'); // migration системээс өмнөх төлөв
    assert.deepEqual(await migrate({ dir: tmp }), []);
    assert.equal((await one('SELECT version FROM schema_migrations')).version, '001');
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM countries')).n), 1);
  });

  test('буруу нэртэй файлыг хүлээн авахгүй', async () => {
    const bad = path.join(tmp, 'add-stuff.sql');
    await fs.writeFile(bad, 'SELECT 1;');
    try {
      await assert.rejects(listMigrations(tmp), /нэр буруу/);
    } finally {
      await fs.rm(bad, { force: true });
    }
  });

  test('db:reset ба seed нь production-д татгалзана', () => {
    const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), PASSPORT_KEY: '1'.repeat(64), DB_NAME: 'civiz_test' };
    for (const script of ['scripts/reset.js', 'scripts/seed.js']) {
      const r = spawnSync(process.execPath, [script], { cwd: serverDir, env, encoding: 'utf8' });
      assert.equal(r.status, 1, `${script}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /production/);
    }
  });
});
