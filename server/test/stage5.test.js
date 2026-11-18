// Үе 5 — production: health (DB + файлын сан), олон инстанс дахь ар талын ажлын түгжээ,
// Docker image-д seed/reset/тест орохгүй, нөөцийн скриптүүд бүрэн байх.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { pool, one, query, withLock } from '../src/db.js';
import { hashPassword, verifyPassword, dummyHash, BCRYPT_ROUNDS } from '../src/lib/password.js';
import { config } from '../src/config.js';
import { dispatchPending } from '../src/lib/notify.js';
import { runRetention } from '../src/lib/retention.js';
import { outbox } from '../src/lib/mailer.js';
import { setup, DEMO } from './helpers.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let app;

/** Өөр инстанс түгжээ эзэмшиж буйг дуурайна: тусдаа холболтоор GET_LOCK авч, release() дуудах хүртэл барина. */
async function holdLock(name) {
  const conn = await pool.getConnection();
  const [[r]] = await conn.query('SELECT GET_LOCK(?, 5) AS ok', [name]);
  assert.equal(Number(r.ok), 1);
  return async () => {
    await conn.query('SELECT RELEASE_LOCK(?)', [name]);
    conn.release();
  };
}

before(async () => {
  ({ app } = await setup());
});
after(async () => {
  await pool.end();
});

describe('Мониторинг: /api/health', () => {
  test('DB + файлын сан ажиллаж байвал 200; дотоод мэдээлэл задлахгүй; кэшлэхгүй', async () => {
    const r = await request(app).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.checks.db.ok, true);
    assert.equal(r.body.checks.storage.ok, true);
    assert.equal(typeof r.body.checks.db.ms, 'number');
    assert.equal(r.body.checks.clamav, undefined, 'ClamAV тохируулаагүй бол шалгахгүй');
    assert.match(r.body.version, /^\d+\.\d+\.\d+/);
    assert.equal(r.headers['cache-control'], 'no-store');
    const text = JSON.stringify(r.body);
    for (const leak of [config.storageDir, config.db.host, config.db.database, config.db.user]) {
      assert.ok(!text.includes(leak), `health хариунд "${leak}" байх ёсгүй`);
    }
  });

  test('файлын сан ашиглах боломжгүй бол 503 (status: down); live хэвээр 200', async () => {
    const saved = config.storageDir;
    const blocker = path.join(os.tmpdir(), `civiz-health-${process.pid}`);
    fs.writeFileSync(blocker, 'not a directory');
    config.storageDir = path.join(blocker, 'storage'); // файл доторх хавтас → mkdir амжилтгүй
    try {
      const r = await request(app).get('/api/health');
      assert.equal(r.status, 503);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.status, 'down');
      assert.equal(r.body.checks.db.ok, true);
      assert.equal(r.body.checks.storage.ok, false);
      assert.ok(!JSON.stringify(r.body).includes(blocker), 'алдааны зам хариунд орохгүй');
      const live = await request(app).get('/api/health/live');
      assert.equal(live.status, 200);
      assert.deepEqual(live.body, { ok: true });
    } finally {
      config.storageDir = saved;
      fs.rmSync(blocker, { force: true });
    }
    assert.equal((await request(app).get('/api/health')).status, 200);
  });

  test('ClamAV тохируулсан ч хүрэхгүй бол degraded (200) — файл PENDING-ээр хүлээгдэнэ', async () => {
    const saved = { ...config.clamav };
    Object.assign(config.clamav, { host: '127.0.0.1', port: 1, timeoutMs: 500 }); // 1-р порт хаалттай
    try {
      const r = await request(app).get('/api/health');
      assert.equal(r.status, 200);
      assert.equal(r.body.status, 'degraded');
      assert.equal(r.body.checks.clamav.ok, false);
    } finally {
      Object.assign(config.clamav, saved);
    }
  });
});

describe('Олон инстанс: ар талын ажлын түгжээ', () => {
  test('withLock: эзэлсэн түгжээг хүлээхгүй, чөлөөлсний дараа авна', async () => {
    const release = await holdLock('civiz_probe');
    try {
      let ran = false;
      const r = await withLock('civiz_probe', async () => {
        ran = true;
      });
      assert.deepEqual(r, { acquired: false });
      assert.equal(ran, false);
    } finally {
      await release();
    }
    const r2 = await withLock('civiz_probe', async () => 42);
    assert.deepEqual(r2, { acquired: true, result: 42 });
  });

  test('withLock: fn алдаа шидэхэд түгжээ чөлөөлөгдөнө', async () => {
    await assert.rejects(
      withLock('civiz_probe', async () => {
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal((await withLock('civiz_probe', async () => 'ok')).result, 'ok');
  });

  test('имэйл outbox: өөр инстанс боловсруулж байхад давхар илгээхгүй', async () => {
    const uid = (await one('SELECT user_id FROM users WHERE email = ?', [DEMO.applicant.email])).user_id;
    await query("UPDATE notifications SET email_status = 'SENT' WHERE email_status = 'PENDING'");
    await query("INSERT INTO notifications (user_id, kind, ref) VALUES (?, 'REVIEW_COMPLETE', 'KR-LOCK-1')", [uid]);
    const before = outbox.length;
    const release = await holdLock('civiz_mailer');
    try {
      assert.equal(await dispatchPending(), 0);
      assert.equal(outbox.length, before);
      assert.equal((await one("SELECT email_status FROM notifications WHERE ref = 'KR-LOCK-1'")).email_status, 'PENDING');
    } finally {
      await release();
    }
    assert.equal(await dispatchPending(), 1);
    assert.equal(outbox.length, before + 1);
    assert.equal((await one("SELECT email_status FROM notifications WHERE ref = 'KR-LOCK-1'")).email_status, 'SENT');
  });

  test('хадгалах хугацааны ажил: өөр процесс ажиллаж байвал алгасна', async () => {
    const release = await holdLock('civiz_retention');
    try {
      assert.deepEqual(await runRetention({ dryRun: true }), { skipped: true });
    } finally {
      await release();
    }
    const out = await runRetention({ dryRun: true });
    assert.equal(out.skipped, undefined);
    assert.equal(typeof out.drafts, 'number');
  });
});

describe('Нууц үгийн хэш — worker_threads (ачааллын туршилтын илрэл)', () => {
  test('bcryptjs-тэй бүрэн нийцтэй (хуучин хэш хүчинтэй, шинэ хэшийг bcryptjs уншина)', async () => {
    const legacy = bcrypt.hashSync('Хуучин-нууц1', 4);
    assert.equal(await verifyPassword('Хуучин-нууц1', legacy), true);
    assert.equal(await verifyPassword('буруу', legacy), false);
    const h = await hashPassword('Шинэ-нууц2');
    assert.match(h, new RegExp(`^\\$2[aby]\\$${String(BCRYPT_ROUNDS).padStart(2, '0')}\\$`));
    assert.equal(bcrypt.compareSync('Шинэ-нууц2', h), true);
  });

  test('олон зэрэг хэшлэхэд event loop түгжигдэхгүй', async () => {
    let maxLag = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      maxLag = Math.max(maxLag, now - last - 5);
      last = now;
    }, 5);
    try {
      // cost 10 × 12: үндсэн thread дээр бол нэг бүр ~50+ мс түгжинэ
      const hashes = await Promise.all(Array.from({ length: 12 }, (_, i) => hashPassword(`pw-${i}`, 10)));
      assert.equal(new Set(hashes).size, 12);
    } finally {
      clearInterval(timer);
    }
    assert.ok(maxLag < 40, `event loop ${Math.round(maxLag)} мс түгжигдлээ`);
  });

  test('бүртгэлгүй имэйлийн нэвтрэлт бодит хэштэй ижил cost-оор харьцуулна (хугацаагаар бүртгэл таагдахгүй)', async () => {
    // Өмнө нь dummy хэш тогтмол cost 4 (production 12) байсан тул байхгүй имэйл хамаагүй хурдан хариулдаг байв
    const cost = (h) => Number(h.split('$')[2]);
    assert.equal(cost(await dummyHash()), BCRYPT_ROUNDS);
    assert.equal(cost(await hashPassword('x')), BCRYPT_ROUNDS);
    const r = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'civiz')
      .send({ email: 'nobody@example.invalid', password: 'Буруу-нууц-үг9' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');
  });
});

describe('Production байршуулалт', () => {
  const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

  test('Docker image-д seed, reset, тест, .env орохгүй; non-root; migration эхлэхдээ ажиллана', () => {
    const ignore = read('.dockerignore')
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const p of ['server/scripts/seed.js', 'server/scripts/reset.js', 'server/test', '.env', '**/node_modules', '.git']) {
      assert.ok(ignore.includes(p), `.dockerignore: ${p}`);
    }
    const df = read('Dockerfile')
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    assert.match(df, /^USER node$/m);
    assert.match(df, /migrate\.js/);
    assert.doesNotMatch(df, /seed|db:reset/);
  });

  test('нөөцийн скриптүүд: bash ба PowerShell хувилбар, сэргээлтийн туршилт', () => {
    for (const f of ['backup.sh', 'restore.sh', 'restore-drill.sh', 'backup.ps1', 'restore.ps1', 'restore-drill.ps1']) {
      assert.ok(fs.existsSync(path.join(repo, 'scripts', f)), `scripts/${f}`);
    }
    // Сэргээлтийн туршилт production санг хэзээ ч дарж бичихгүй
    assert.match(read('scripts/restore-drill.sh'), /DRILL_DB.*civiz_restore_drill/);
    assert.match(read('scripts/restore-drill.ps1'), /civiz_restore_drill/);
  });
});
