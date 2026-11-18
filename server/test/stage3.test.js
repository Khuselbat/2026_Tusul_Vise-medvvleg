// Үе 3: файлын шифрлэлт, вирус шалгалт (хуурамч clamd), хадгалах хугацаа, мэдээлэл татах, бүртгэл устгах, түлхүүр эргүүлэх.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pool, query, one } from '../src/db.js';
import { config } from '../src/config.js';
import { encryptBlob, decryptBlob, isEncrypted, saveFile } from '../src/lib/storage.js';
import { processPendingScans } from '../src/lib/scanner.js';
import { runRetention } from '../src/lib/retention.js';
import { REDACTED } from '../src/lib/erasure.js';
import { setup, login, client, newApplicant, submitApplication, assign, review, DEMO, PDF, uuid } from './helpers.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let app, ids, admin, op;
const diskPath = (key) => path.join(config.storageDir, key.slice(0, 2), key);
const onDisk = (key) =>
  fs
    .access(diskPath(key))
    .then(() => true)
    .catch(() => false);
const binary = (r) =>
  r.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
  op = await login(app, DEMO.operator);
});
after(async () => {
  await pool.end();
});

describe('Файлын шифрлэлт (AES-256-GCM)', () => {
  test('шифрлэх/тайлах; өөрчилсөн агуулга таних; шифрлээгүйг шууд уншина', () => {
    const enc = encryptBlob(PDF);
    assert.ok(isEncrypted(enc));
    assert.ok(!enc.includes(Buffer.from('%PDF')));
    assert.deepEqual(decryptBlob(enc), PDF);
    assert.deepEqual(decryptBlob(PDF), PDF, 'хуучин шифрлээгүй файл');
    const bad = Buffer.from(enc);
    bad[bad.length - 1] ^= 1;
    assert.throws(() => decryptBlob(bad));
  });

  test('STORAGE_ENCRYPT=1: дискэнд шифртэй, API эх агуулгыг буцаана, SHA-256 эхнийх', async () => {
    config.storage.encrypt = true;
    try {
      const { c } = await newApplicant(app, 'enc');
      const d = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
      const up = await c.multipart(`/api/app/drafts/${d}/documents`, { requirementId: ids.reqIds.PASSPORT_COPY }, [
        { buf: PDF, name: 'p.pdf' },
      ]);
      assert.equal(up.status, 201);
      const row = await one('SELECT storage_key, sha256 FROM application_documents WHERE document_id = ?', [up.body.document.id]);
      const raw = await fs.readFile(diskPath(row.storage_key));
      assert.ok(isEncrypted(raw) && !raw.includes(Buffer.from('%PDF')));
      config.storage.encrypt = false; // унтраасны дараа ч хуучин шифртэй файл уншигдана
      const got = await binary(c.get(`/api/files/${up.body.document.id}`));
      assert.equal(got.status, 200);
      assert.deepEqual(got.body, PDF);
    } finally {
      config.storage.encrypt = false;
    }
  });
});

describe('Вирус шалгалт (clamd INSTREAM)', () => {
  let srv;
  let port;
  before(async () => {
    // Хуурамч clamd: “EICAR” агуулсан бол FOUND, үгүй бол OK
    srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        let o = 10; // 'zINSTREAM\0'
        const body = [];
        while (buf.length >= o + 4) {
          const n = buf.readUInt32BE(o);
          if (n === 0) {
            const content = Buffer.concat(body).toString('latin1');
            sock.end(content.includes('EICAR') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
            return;
          }
          if (buf.length < o + 4 + n) return;
          body.push(buf.subarray(o + 4, o + 4 + n));
          o += 4 + n;
        }
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    port = srv.address().port;
    config.clamav.host = '127.0.0.1';
    config.clamav.port = port;
  });
  after(async () => {
    config.clamav.host = '';
    await new Promise((r) => srv.close(r));
  });

  test('шинэ файл PENDING — нээхгүй, илгээхгүй; шалгалтын дараа ACCEPTED', async () => {
    const { c } = await newApplicant(app, 'scan');
    const d = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const up = await c.multipart(`/api/app/drafts/${d}/documents`, { requirementId: ids.reqIds.PASSPORT_COPY }, [
      { buf: PDF, name: 'p.pdf' },
    ]);
    assert.equal(up.body.document.scanStatus, 'PENDING');
    const blocked = await c.get(`/api/files/${up.body.document.id}`);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'FILE_SCANNING');
    const out = await processPendingScans();
    assert.ok(out.accepted >= 1);
    assert.equal((await c.get(`/api/files/${up.body.document.id}`)).status, 200);
  });

  test('халдвартай файл REJECTED — хадгалалтаас устгана, 410, audit', async () => {
    const { c } = await newApplicant(app, 'virus');
    const d = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const evil = Buffer.concat([PDF, Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]);
    const up = await c.multipart(`/api/app/drafts/${d}/documents`, { requirementId: ids.reqIds.PASSPORT_COPY }, [
      { buf: evil, name: 'eicar.pdf' },
    ]);
    const key = (await one('SELECT storage_key FROM application_documents WHERE document_id = ?', [up.body.document.id])).storage_key;
    await processPendingScans();
    const row = await one('SELECT scan_status FROM application_documents WHERE document_id = ?', [up.body.document.id]);
    assert.equal(row.scan_status, 'REJECTED');
    assert.equal(await onDisk(key), false);
    assert.equal((await c.get(`/api/files/${up.body.document.id}`)).status, 410);
    assert.ok(
      await one("SELECT 1 AS x FROM audit_events WHERE action = 'FILE_REJECTED' AND entity_key = ?", [String(up.body.document.id)]),
    );
  });

  test('clamd хүрэхгүй бол PENDING хэвээр (дараа дахин оролдоно)', async () => {
    config.clamav.port = 1; // хаалттай порт
    try {
      const { c } = await newApplicant(app, 'down');
      const d = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
      const up = await c.multipart(`/api/app/drafts/${d}/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
        { buf: PDF, name: 'b.pdf' },
      ]);
      const out = await processPendingScans();
      assert.equal(out.accepted + out.rejected, 0);
      assert.equal(
        (await one('SELECT scan_status FROM application_documents WHERE document_id = ?', [up.body.document.id])).scan_status,
        'PENDING',
      );
    } finally {
      config.clamav.port = port;
      await processPendingScans();
    }
  });
});

describe('Хадгалах хугацаа', () => {
  test('хуучин ноорог файлтай нь, хуучин өнчин файл устна; шинэ/илгээсэн хэвээр; dry-run өөрчлөхгүй', async () => {
    const { c } = await newApplicant(app, 'ret');
    const oldD = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const up = await c.multipart(`/api/app/drafts/${oldD}/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
      { buf: PDF, name: 'o.pdf' },
    ]);
    const oldKey = (await one('SELECT storage_key FROM application_documents WHERE document_id = ?', [up.body.document.id])).storage_key;
    await query('UPDATE applications SET created_at = NOW(6) - INTERVAL 40 DAY WHERE public_id = ?', [oldD]);
    const newD = (await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const sent = await submitApplication(c, ids);
    await query('UPDATE applications SET created_at = NOW(6) - INTERVAL 400 DAY WHERE public_id = ?', [sent]);
    const orphanOld = (await saveFile(PDF)).storageKey;
    const orphanNew = (await saveFile(PDF)).storageKey;
    const past = new Date(Date.now() - 3 * 864e5);
    await fs.utimes(diskPath(orphanOld), past, past);

    const dry = await runRetention({ dryRun: true });
    assert.ok(dry.drafts >= 1 && dry.orphanFiles >= 1);
    assert.ok(await one('SELECT 1 AS x FROM applications WHERE public_id = ?', [oldD]), 'dry-run устгахгүй');

    const out = await runRetention();
    assert.ok(out.drafts >= 1 && out.orphanFiles >= 1);
    assert.equal(await one('SELECT 1 AS x FROM applications WHERE public_id = ?', [oldD]), null);
    assert.equal(await onDisk(oldKey), false);
    assert.equal(await onDisk(orphanOld), false);
    assert.ok(await onDisk(orphanNew), 'шинэ өнчин файлыг (upload явагдаж байж болох) үлдээнэ');
    assert.ok(await one('SELECT 1 AS x FROM applications WHERE public_id = ?', [newD]));
    assert.ok(await one('SELECT 1 AS x FROM applications WHERE public_id = ?', [sent]), 'илгээсэн архивыг автоматаар устгахгүй');
    assert.ok(await one("SELECT 1 AS x FROM audit_events WHERE action = 'RETENTION_RUN'"));
  });
});

// Мэдээлэл татах — ZIP-ийн оронд PDF болсон: test/stage6.test.js
describe('Бүртгэл устгах хүсэлт', () => {
  let c, user, ref, docKeys, reqId;
  before(async () => {
    ({ c, user } = await newApplicant(app, 'erase'));
    ref = await submitApplication(c, ids);
    await assign(admin, ref, ids.opId);
    await review(op, ref, 'INCOMPLETE', 'Паспорт E7654321 бүдэг');
    docKeys = (
      await query(
        'SELECT d.storage_key FROM application_documents d JOIN applications a ON a.application_id = d.application_id WHERE a.public_id = ?',
        [ref],
      )
    ).map((x) => x.storage_key);
  });

  test('хүсэлт: нууц үг заавал, давхардахгүй, цуцалж болно, админд мэдэгдэл', async () => {
    assert.equal((await c.post('/api/app/privacy/deletion', { password: 'nope12345' })).status, 400);
    const a = await c.post('/api/app/privacy/deletion', { password: user.password, reason: 'Ашиглахаа больсон' });
    assert.equal(a.status, 201);
    assert.equal((await c.post('/api/app/privacy/deletion', { password: user.password })).status, 409);
    assert.ok((await admin.get('/api/notifications')).body.items.some((n) => n.kind === 'DELETION_REQUESTED'));
    assert.equal((await c.del('/api/app/privacy/deletion')).status, 200);
    assert.equal((await c.get('/api/app/privacy/deletion')).body.request.status, 'CANCELLED');
    reqId = (await c.post('/api/app/privacy/deletion', { password: user.password })).body.id;
  });

  test('админ: идэвхтэй мэдүүлэгтэй бол 409; татгалзахад шалтгаан заавал; бусад эрх 403', async () => {
    const list = (await admin.get('/api/admin/deletion-requests')).body.items;
    const it = list.find((x) => x.id === reqId);
    assert.equal(it.activeApplications, 1);
    assert.equal((await admin.post(`/api/admin/deletion-requests/${reqId}/approve`)).status, 409);
    assert.equal((await admin.post(`/api/admin/deletion-requests/${reqId}/reject`, { note: '' })).status, 400);
    assert.equal((await op.post(`/api/admin/deletion-requests/${reqId}/approve`)).status, 403);
    assert.equal((await c.post(`/api/admin/deletion-requests/${reqId}/approve`)).status, 403);
  });

  test('баталгаажуулахад хувийн мэдээлэл, файл устаж, мэдүүлэг нэргүй статистик болж үлдэнэ', async () => {
    await review(op, ref, 'COMPLETE');
    const r = await admin.post(`/api/admin/deletion-requests/${reqId}/approve`, { note: 'Баталгаажуулав' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.files >= 3);
    for (const k of docKeys) assert.equal(await onDisk(k), false);
    const u = await one('SELECT email, display_name, is_active FROM users WHERE email = ?', [user.email]);
    assert.equal(u, null, 'имэйл устсан');
    const a = await one(
      'SELECT a.status, u.email, u.is_active FROM applications a JOIN users u ON u.user_id = a.applicant_id WHERE a.public_id = ?',
      [ref],
    );
    assert.equal(a.status, 'COMPLETE');
    assert.match(a.email, /^deleted-\d+@deleted\.invalid$/);
    assert.equal(a.is_active, 0);
    assert.equal(
      await one('SELECT 1 AS x FROM application_forms f JOIN applications a ON a.application_id = f.application_id WHERE a.public_id = ?', [
        ref,
      ]),
      null,
    );
    const comments = (
      await query('SELECT r.comment FROM reviews r JOIN applications a ON a.application_id = r.application_id WHERE a.public_id = ?', [ref])
    ).map((x) => x.comment);
    assert.ok(comments.every((x) => x === null || x === REDACTED));
    assert.equal((await c.get('/api/app/dashboard')).status, 401, 'сесс хүчингүй');
    assert.equal((await client(app).post('/api/auth/login', { email: user.email, password: user.password })).status, 401);
    assert.equal((await admin.post(`/api/admin/deletion-requests/${reqId}/approve`)).status, 409, 'давтан шийдвэрлэхгүй');
    const verify = spawnSync(process.execPath, ['scripts/verify-storage.js'], {
      cwd: serverDir,
      env: { ...process.env, NODE_ENV: 'test' },
      encoding: 'utf8',
    });
    assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  });
});

describe('Түлхүүр эргүүлэх', () => {
  test('паспорт, 2FA нууц, файлыг шинэ түлхүүрээр дахин шифрлэнэ; dry-run өөрчлөхгүй; verify-storage тэнцэнэ', async () => {
    const NEWP = '2'.repeat(64);
    const NEWF = '3'.repeat(64);
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      PASSPORT_KEY: NEWP,
      PASSPORT_KEY_ID: 'k2',
      PASSPORT_KEYS_OLD: `k1:${'0'.repeat(64)}`,
      STORAGE_ENCRYPT: '1',
      FILE_KEY: NEWF,
      FILE_KEY_ID: 'f2',
      FILE_KEYS_OLD: `f1:${'1'.repeat(64)}`,
    };
    const run = (args) => spawnSync(process.execPath, ['scripts/rotate-keys.js', ...args], { cwd: serverDir, env, encoding: 'utf8' });
    const before = Number((await one("SELECT COUNT(*) AS n FROM application_forms WHERE passport_key_id = 'k1'")).n);
    assert.ok(before > 0);
    const dry = run(['--dry-run', '--files']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM application_forms WHERE passport_key_id = 'k1'")).n), before);

    const r = run(['--files']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM application_forms WHERE passport_key_id <> 'k2'")).n), 0);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM users WHERE mfa_secret_enc IS NOT NULL AND mfa_key_id <> 'k2'")).n), 0);
    const anyKey = (await one("SELECT storage_key FROM application_documents WHERE scan_status = 'ACCEPTED' LIMIT 1")).storage_key;
    const raw = await fs.readFile(diskPath(anyKey));
    assert.ok(isEncrypted(raw) && raw.subarray(5, 7).toString() === 'f2');
    const v = spawnSync(process.execPath, ['scripts/verify-storage.js'], { cwd: serverDir, env, encoding: 'utf8' });
    assert.equal(v.status, 0, v.stdout + v.stderr);
    // Давтан ажиллуулахад өөрчлөх зүйлгүй
    const again = run(['--files']);
    assert.match(again.stdout, /passports: 0, mfaSecrets: 0, files: 0/);
  });
});
