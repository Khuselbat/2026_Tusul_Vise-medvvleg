// React build-ийг үйлчлэх кэшийн бодлого: hash-тай /assets — immutable, index.html — no-cache, байхгүй asset — 404.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

let app;
let dir;
const original = config.clientDist;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'civiz-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  config.clientDist = dir;
  app = createApp();
});
after(async () => {
  config.clientDist = original;
  fs.rmSync(dir, { recursive: true, force: true });
  await pool.end();
});

describe('Статик файлын кэш', () => {
  test('hash-тай asset — 1 жил immutable', async () => {
    const r = await request(app).get('/assets/index-abc123.js');
    assert.equal(r.status, 200);
    assert.match(r.headers['cache-control'], /max-age=31536000/);
    assert.match(r.headers['cache-control'], /immutable/);
  });
  test('байхгүй asset — index.html биш 404', async () => {
    const r = await request(app).get('/assets/index-old999.js');
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.text || '', /<div id="root">/);
  });
  test('SPA route — index.html, no-cache', async () => {
    const r = await request(app).get('/app/applications');
    assert.equal(r.status, 200);
    assert.match(r.text, /<div id="root">/);
    assert.equal(r.headers['cache-control'], 'no-cache');
  });
  test('бусад статик файл — 1 цаг', async () => {
    const r = await request(app).get('/favicon.svg');
    assert.equal(r.status, 200);
    assert.match(r.headers['cache-control'], /max-age=3600/);
  });
  test('API-ийн 404 хэвээр JSON', async () => {
    const r = await request(app).get('/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
  });
});
