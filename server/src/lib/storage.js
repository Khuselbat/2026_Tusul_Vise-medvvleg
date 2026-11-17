import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Хувийн файл хадгалах сан (NFR-01): вэбээс шууд хандахгүй; файлд зөвхөн эрх шалгасан API-аар.
 * Үе 3: драйвер — `local` (сервер дээрх хавтас) эсвэл `s3` (MinIO/AWS S3 г.м.).
 * `STORAGE_ENCRYPT=1` үед файлыг AES-256-GCM-ээр шифрлэж бичнэ (тусдаа FILE_KEY, key id-тай → эргүүлж болно).
 * Шифрлээгүй хуучин файл хэвээр уншигдана (толгойн тэмдгээр ялгана). SHA-256 нь эх агуулгынх.
 */
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

const EXT_OK = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** Агуулгын эхний байтаар (magic bytes) төрлийг тогтооно — өргөтгөл, браузерын mime-д итгэхгүй. */
export function detectType(buffer, originalName) {
  const sig = SIGNATURES.find((s) => buffer.length > 8 && s.test(buffer));
  if (!sig) return null;
  const ext = path
    .extname(originalName || '')
    .slice(1)
    .toLowerCase();
  if (!EXT_OK[ext] || EXT_OK[ext] !== sig.mime) return null;
  return sig.mime;
}

export function safeFileName(name) {
  // Хяналтын тэмдэгтүүд (U+0000–U+001F)-ийг санаатайгаар орлуулна
  // eslint-disable-next-line no-control-regex
  const unsafe = /[\\/:*?"<>|\u0000-\u001f]/g;
  return String(name || 'file')
    .replace(unsafe, '_')
    .slice(0, 200);
}

const KEY_RE = /^[a-f0-9-]{36}$/;
const checkKey = (k) => {
  if (!KEY_RE.test(k)) throw new Error('invalid storage key');
  return k;
};

/* ───────────── Шифрлэлт: [CVZ1][keyIdLen][keyId][iv 12][tag 16][ciphertext] ───────────── */
const MAGIC = Buffer.from('CVZ1');

function loadKeys() {
  const keys = new Map();
  if (config.storage.keyHex) keys.set(config.storage.keyId, Buffer.from(config.storage.keyHex, 'hex'));
  for (const pair of config.storage.oldKeys.split(',').filter(Boolean)) {
    const [id, hex] = pair.split(':');
    keys.set(id, Buffer.from(hex, 'hex'));
  }
  for (const [id, k] of keys) if (k.length !== 32) throw new Error(`FILE_KEY (${id}) нь 32 байт (64 hex) байх ёстой.`);
  if (config.storage.encrypt && !keys.has(config.storage.keyId)) throw new Error('STORAGE_ENCRYPT=1 үед FILE_KEY заавал.');
  return keys;
}
const fileKeys = loadKeys();

export const isEncrypted = (buf) => buf.length > 34 && buf.subarray(0, 4).equals(MAGIC);
export const encryptedKeyId = (buf) => (isEncrypted(buf) ? buf.subarray(5, 5 + buf[4]).toString('utf8') : null);

export function encryptBlob(plain, keyId = config.storage.keyId) {
  const key = fileKeys.get(keyId);
  if (!key) throw new Error(`Файлын түлхүүр олдсонгүй: ${keyId}`);
  const id = Buffer.from(keyId, 'utf8');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, Buffer.from([id.length]), id, iv, c.getAuthTag(), ct]);
}

export function decryptBlob(buf) {
  if (!isEncrypted(buf)) return buf; // шифрлээгүй (хуучин эсвэл STORAGE_ENCRYPT=0)
  const idLen = buf[4];
  const keyId = buf.subarray(5, 5 + idLen).toString('utf8');
  const key = fileKeys.get(keyId);
  if (!key) throw new Error(`Файлын түлхүүр олдсонгүй: ${keyId}`);
  const o = 5 + idLen;
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(o, o + 12));
  d.setAuthTag(buf.subarray(o + 12, o + 28));
  return Buffer.concat([d.update(buf.subarray(o + 28)), d.final()]);
}

/* ───────────── Драйверууд ───────────── */
const localDriver = {
  name: 'local',
  file: (k) => path.join(config.storageDir, k.slice(0, 2), k),
  async put(k, buf, { overwrite = false } = {}) {
    const p = this.file(k);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await fs.writeFile(p, buf, { mode: 0o600, flag: overwrite ? 'w' : 'wx' });
  },
  get(k) {
    return fs.readFile(this.file(k));
  },
  async del(k) {
    await fs.rm(this.file(k), { force: true });
  },
  /** { key, modifiedAt } — өнчин файл цэвэрлэх, түлхүүр эргүүлэхэд */
  async *list() {
    let dirs = [];
    try {
      dirs = await fs.readdir(config.storageDir);
    } catch {
      return;
    }
    for (const d of dirs) {
      if (!/^[a-f0-9]{2}$/.test(d)) continue;
      for (const f of await fs.readdir(path.join(config.storageDir, d))) {
        if (!KEY_RE.test(f)) continue;
        const st = await fs.stat(path.join(config.storageDir, d, f));
        yield { key: f, modifiedAt: st.mtime };
      }
    }
  },
  async health() {
    await fs.mkdir(config.storageDir, { recursive: true });
    await fs.access(config.storageDir, fs.constants?.W_OK);
  },
};

let s3Driver = null;
async function getS3Driver() {
  if (s3Driver) return s3Driver;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } =
    await import('@aws-sdk/client-s3');
  const c = config.storage.s3;
  if (!c.bucket) throw new Error('S3_BUCKET тохируулаагүй байна.');
  const client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: c.forcePathStyle,
    credentials: c.accessKeyId ? { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } : undefined,
  });
  const objKey = (k) => `${c.prefix}${k.slice(0, 2)}/${k}`;
  s3Driver = {
    name: 's3',
    async put(k, buf, { overwrite = false } = {}) {
      await client.send(
        new PutObjectCommand({
          Bucket: c.bucket,
          Key: objKey(k),
          Body: buf,
          ContentType: 'application/octet-stream',
          ...(overwrite ? {} : { IfNoneMatch: '*' }),
        }),
      );
    },
    async get(k) {
      const r = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key: objKey(k) }));
      return Buffer.from(await r.Body.transformToByteArray());
    },
    async del(k) {
      await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: objKey(k) }));
    },
    async *list() {
      let token;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: c.prefix, ContinuationToken: token }));
        for (const o of r.Contents || []) {
          const key = o.Key.split('/').pop();
          if (KEY_RE.test(key)) yield { key, modifiedAt: o.LastModified };
        }
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
    },
    async health() {
      await client.send(new HeadBucketCommand({ Bucket: c.bucket }));
    },
  };
  return s3Driver;
}

export async function driver() {
  return config.storage.driver === 's3' ? getS3Driver() : localDriver;
}

/* ───────────── Нийтийн API ───────────── */

export async function saveFile(buffer) {
  const storageKey = crypto.randomUUID();
  const d = await driver();
  await d.put(storageKey, config.storage.encrypt ? encryptBlob(buffer) : buffer);
  return { storageKey, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

/** Эх (шифр тайлсан) агуулгыг буцаана. */
export async function readFile(storageKey) {
  const d = await driver();
  return decryptBlob(await d.get(checkKey(storageKey)));
}

export async function removeFile(storageKey) {
  const d = await driver();
  try {
    await d.del(checkKey(storageKey));
  } catch (e) {
    if (e?.name !== 'NoSuchKey' && e?.code !== 'ENOENT') throw e;
  }
}

/** Хадгалсан байтыг (шифртэй байж болно) дахин бичих — түлхүүр эргүүлэхэд. */
export async function rewriteRaw(storageKey, transform) {
  const d = await driver();
  const raw = await d.get(checkKey(storageKey));
  const next = transform(raw);
  if (next && !next.equals(raw)) {
    await d.put(storageKey, next, { overwrite: true });
    return true;
  }
  return false;
}

export async function* listStoredFiles() {
  const d = await driver();
  yield* d.list();
}

export async function storageHealth() {
  const d = await driver();
  await d.health();
  return d.name;
}
