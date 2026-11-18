// Нууц үгийн хэш (NFR-02: bcrypt cost 12). Үе 5-ын ачааллын туршилтаар: bcryptjs (цэвэр JS) үндсэн event loop дээр
// ажиллахад 100 зэрэг нэвтрэлт бүгд ~18 сек хүлээж, бусад бүх хүсэлтийг зогсоож байсан. Иймд тооцооллыг
// worker_threads-ийн жижиг сан руу шилжүүлнэ — event loop чөлөөтэй, цөмийн тоогоор зэрэгцэнэ. Хэшийн формат өөрчлөгдөхгүй.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { config } from '../config.js';

export const BCRYPT_ROUNDS = config.isTest ? 4 : 12;
const SIZE = Math.max(1, Number(process.env.BCRYPT_WORKERS) || Math.min(4, Math.max(1, os.availableParallelism() - 1)));

const workers = [];
const pending = new Map();
let seq = 0;

function spawn() {
  const w = new Worker(new URL('./passwordWorker.js', import.meta.url));
  w.busy = 0;
  w.unref(); // хүлээгдэж буй ажил байхгүй үед процесс гарахыг саатуулахгүй
  w.on('message', ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    w.busy -= 1;
    if (w.busy === 0) w.unref();
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  });
  const fail = (err) => {
    // Унасан worker-ийн ажлуудыг алдаагаар дуусгаж, дараагийн хүсэлтэд шинээр үүсгэнэ
    for (const [id, p] of pending) {
      if (p.worker === w) {
        pending.delete(id);
        p.reject(err instanceof Error ? err : new Error(`password worker exited (${err})`));
      }
    }
    const i = workers.indexOf(w);
    if (i >= 0) workers.splice(i, 1);
  };
  w.on('error', fail);
  w.on('exit', (code) => code !== 0 && fail(code));
  workers.push(w);
  return w;
}

/** Сул worker → шинэ worker (хязгаар хүртэл) → хамгийн бага ачаалалтай */
function pick() {
  const idle = workers.find((w) => w.busy === 0);
  if (idle) return idle;
  if (workers.length < SIZE) return spawn();
  return workers.reduce((a, b) => (b.busy < a.busy ? b : a));
}

function run(msg) {
  const w = pick();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, worker: w });
    if (w.busy === 0) w.ref(); // ажил дуусах хүртэл процесс амьд байна
    w.busy += 1;
    w.postMessage({ id, ...msg });
  });
}

export const hashPassword = (password, rounds = BCRYPT_ROUNDS) => run({ op: 'hash', password, rounds });
export const verifyPassword = (password, hash) => run({ op: 'compare', password, hash });

// Бүртгэлгүй имэйлээр нэвтрэх оролдлогод ч ижил cost-той хэштэй харьцуулна — хариу хугацаагаар бүртгэл таагдахгүй.
// (Өмнө нь cost 4 байсан тул байхгүй имэйл ~50 дахин хурдан хариулдаг байв.)
let dummy;
export const dummyHash = () => (dummy ??= hashPassword('timing-equaliser'));
export async function verifyAgainstDummy(password) {
  await verifyPassword(password, await dummyHash());
  return false;
}
