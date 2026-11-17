// Үе 3 — S3-тэй нийцтэй файлын сан (MinIO, AWS S3 г.м.). Зөвхөн S3_TEST=1 үед ажиллана (CI нь S3 эмулятортой ажиллуулна):
//   S3_TEST=1 S3_ENDPOINT=http://127.0.0.1:9000 S3_BUCKET=civiz-test S3_ACCESS_KEY=… S3_SECRET_KEY=… node --test test/s3.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

const enabled = process.env.S3_TEST === '1';

describe('S3 драйвер', { skip: !enabled && 'S3_TEST=1 тохируулаагүй' }, () => {
  let storage;
  before(async () => {
    config.storage.driver = 's3';
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    const c = config.storage.s3;
    const client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      forcePathStyle: c.forcePathStyle,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: c.bucket }));
    } catch (e) {
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(e.name)) throw e;
    }
    storage = await import('../src/lib/storage.js');
  });

  test('бичих, унших, жагсаах, устгах; давхар бичихгүй', async () => {
    assert.equal(await storage.storageHealth(), 's3');
    const body = Buffer.from('%PDF-1.4 s3 test');
    const { storageKey, sha256 } = await storage.saveFile(body);
    assert.match(sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await storage.readFile(storageKey), body);
    const keys = [];
    for await (const f of storage.listStoredFiles()) keys.push(f.key);
    assert.ok(keys.includes(storageKey));
    await storage.removeFile(storageKey);
    await assert.rejects(storage.readFile(storageKey));
    await storage.removeFile(storageKey); // байхгүй файлыг устгахад алдаа гаргахгүй
  });

  test('шифрлэлттэй: объект шифртэй, уншихад эх агуулга', async () => {
    config.storage.encrypt = true;
    try {
      const body = Buffer.from('%PDF-1.4 secret passport scan');
      const { storageKey } = await storage.saveFile(body);
      const d = await storage.driver();
      const raw = await d.get(storageKey);
      assert.ok(storage.isEncrypted(raw) && !raw.includes(Buffer.from('passport')));
      assert.deepEqual(await storage.readFile(storageKey), body);
      await storage.removeFile(storageKey);
    } finally {
      config.storage.encrypt = false;
    }
  });
});
