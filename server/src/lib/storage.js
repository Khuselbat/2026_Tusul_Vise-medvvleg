import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Хувийн файл хадгалах сан. Вэб серверийн нийтийн хавтсаас гадна байрлана;
 * файлд зөвхөн эрх шалгасан API-аар хандана (NFR-01).
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

function fullPath(storageKey) {
  if (!/^[a-f0-9-]{36}$/.test(storageKey)) throw new Error('invalid storage key');
  return path.join(config.storageDir, storageKey.slice(0, 2), storageKey);
}

export async function saveFile(buffer) {
  const storageKey = crypto.randomUUID();
  const p = fullPath(storageKey);
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await fs.writeFile(p, buffer, { mode: 0o600, flag: 'wx' });
  return { storageKey, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function readFile(storageKey) {
  return fs.readFile(fullPath(storageKey));
}

export async function removeFile(storageKey) {
  await fs.rm(fullPath(storageKey), { force: true });
}

export function safeFileName(name) {
  // Хяналтын тэмдэгтүүд (U+0000–U+001F)-ийг санаатайгаар орлуулна
  // eslint-disable-next-line no-control-regex
  const unsafe = /[\\/:*?"<>|\u0000-\u001f]/g;
  return String(name || 'file')
    .replace(unsafe, '_')
    .slice(0, 200);
}
