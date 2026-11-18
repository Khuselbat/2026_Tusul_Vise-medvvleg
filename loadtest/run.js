// Үе 5 — ачааллын туршилт: 100 зэрэг хэрэглэгч (autocannon). Production серверт БҮҮ ажиллуул — тусдаа орчинд.
//
//   1) cd server && DB_NAME=civiz_load npm run db:reset && cd ..
//   2) cd server && DB_NAME=civiz_load node scripts/loadtest-prepare.js --users 100
//   3) Сервер: cd client && npm run build; cd ../server && NODE_ENV=production DB_NAME=civiz_load COOKIE_SECURE=0 … npm start
//   4) node loadtest/run.js --url http://127.0.0.1:4000 --users 100 --duration 20
//
// Хувилбар: 1) 100 хэрэглэгч зэрэг нэвтэрнэ (bcrypt cost 12) — хариу хугацаа; 2) нийтийн хуудас (визийн мэдээлэл, SPA);
// 3) нэвтэрсэн мэдүүлэгчийн самбар/архив/мэдэгдэл; 4) анкетын автомат хадгалалт (шифрлэж DB-д бичих).
// Гаралт: README-д хуулах Markdown хүснэгт + loadtest/results/<огноо>.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.LOAD_URL || 'http://127.0.0.1:4000' },
    users: { type: 'string', default: '100' },
    connections: { type: 'string', default: '100' },
    duration: { type: 'string', default: '20' },
    password: { type: 'string', default: process.env.LOAD_PASSWORD || 'LoadTest1234' },
    submit: { type: 'string', default: '50' }, // зэрэг бүтэн илгээх мэдүүлгийн тоо (0 — алгасах)
  },
});
const BASE = values.url.replace(/\/+$/, '');
const N = Number(values.users);
const CONN = Number(values.connections);
const DURATION = Number(values.duration);
const SUBMIT = Math.min(Number(values.submit), N);
const email = (i) => `load-${String(i).padStart(3, '0')}@load.invalid`;
const H = { 'X-Requested-With': 'civiz', 'Content-Type': 'application/json' };

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function loginAll() {
  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const s = performance.now();
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ email: email(i + 1), password: values.password }),
      });
      const ms = performance.now() - s;
      const sid = r.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .find((c) => c.startsWith('civiz_sid='));
      return { ok: r.status === 200 && !!sid, status: r.status, ms, cookie: sid };
    }),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length)
    throw new Error(
      `${failed.length}/${N} нэвтрэлт амжилтгүй (жишээ статус ${failed[0].status}). scripts/loadtest-prepare.js ажилласан уу?`,
    );
  const ms = results.map((r) => r.ms);
  return {
    cookies: results.map((r) => r.cookie),
    stats: { n: N, totalMs: Math.round(performance.now() - t0), p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms) },
  };
}

async function createDrafts(cookies) {
  const visas = await (await fetch(`${BASE}/api/visas`)).json();
  const v = visas.visas.find((x) => x.canApply);
  if (!v) throw new Error('Мэдүүлэг авах (canApply) нийтэлсэн визийн мэдээлэл алга');
  return Promise.all(
    cookies.map(async (cookie) => {
      const r = await fetch(`${BASE}/api/app/drafts`, {
        method: 'POST',
        headers: { ...H, Cookie: cookie },
        body: JSON.stringify({ versionId: v.versionId, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await r.json();
      if (r.status >= 300) throw new Error(`Ноорог үүсгэж чадсангүй: ${r.status} ${JSON.stringify(body)}`);
      return body.publicId;
    }),
  ).then((drafts) => ({ drafts, versionId: v.versionId }));
}

/** Холболт бүр өөрийн хэрэглэгчтэй (cookie) — бодит 100 өөр хэрэглэгч */
function perUser(cookies, drafts) {
  let next = 0;
  return (req, ctx) => {
    if (ctx.u === undefined) ctx.u = next++ % cookies.length;
    const out = { ...req, headers: { ...req.headers, Cookie: cookies[ctx.u] } };
    if (out.path.includes(':draft')) out.path = out.path.replace(':draft', drafts[ctx.u]);
    return out;
  };
}

function run(title, opts) {
  return new Promise((resolve, reject) => {
    const inst = autocannon({ url: BASE, connections: CONN, duration: DURATION, timeout: 10, ...opts }, (err, r) =>
      err ? reject(err) : resolve({ title, r }),
    );
    process.stdout.write(`… ${title}\n`);
    autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

const row = ({ title, r }) => ({
  scenario: title,
  rps: Math.round(r.requests.average),
  p50: r.latency.p50,
  p90: r.latency.p90,
  p99: r.latency.p99,
  max: r.latency.max,
  total: r.requests.total,
  non2xx: r.non2xx,
  errors: r.errors + r.timeouts,
});

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
console.log(`Сервер: ${BASE} (${health.status}, v${health.version}); ${N} хэрэглэгч, ${CONN} зэрэг холболт × ${DURATION} сек`);

const login = await loginAll();
console.log(
  `Нэвтрэлт: ${N} зэрэг → нийт ${login.stats.totalMs} мс, p50 ${Math.round(login.stats.p50)} мс, p95 ${Math.round(login.stats.p95)} мс`,
);
const { drafts, versionId } = await createDrafts(login.cookies);
const setup = perUser(login.cookies, drafts);

const results = [];
results.push(
  await run('Нийтийн: визийн жагсаалт + дэлгэрэнгүй + SPA', {
    requests: [
      { method: 'GET', path: '/api/visas' },
      { method: 'GET', path: `/api/visas/${versionId}` },
      { method: 'GET', path: '/' },
    ],
  }),
);
results.push(
  await run('Мэдүүлэгч: самбар + архив + мэдэгдэл', {
    requests: [
      { method: 'GET', path: '/api/app/dashboard', setupRequest: setup },
      { method: 'GET', path: '/api/app/applications', setupRequest: setup },
      { method: 'GET', path: '/api/notifications', setupRequest: setup },
    ],
  }),
);
const form = JSON.stringify({ familyName: 'LOAD', givenName: 'TEST', travelPurpose: 'Ачааллын туршилт', passportNumber: 'E0000000' });
results.push(
  await run('Мэдүүлэгч: анкет автомат хадгалах (шифрлэж бичих)', {
    requests: [{ method: 'PUT', path: '/api/app/drafts/:draft/autosave', headers: H, body: form, setupRequest: setup }],
  }),
);

/**
 * NFR-05: SUBMIT хэрэглэгч ЗЭРЭГ бүтэн мэдүүлэг илгээнэ (анкет + 3 файл + илгээх). Дараа нь
 * `scripts/backup.sh` → `restore-drill.sh`-ээр 50 мэдүүлэг / 150 файлын хяналтын нийлбэрийг 100% тулгана (NFR-04).
 */
async function submitAll(cookies, drafts) {
  const { visa } = await (await fetch(`${BASE}/api/visas/${versionId}`)).json();
  const reqs = visa.requirements.filter((r) => r.isRequired);
  const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
  const pdf = (i, code) => Buffer.from(`%PDF-1.4\n% load ${i} ${code} ${crypto.randomUUID()}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
  const t0 = performance.now();
  const ms = await Promise.all(
    cookies.slice(0, SUBMIT).map(async (cookie, i) => {
      const s = performance.now();
      const hc = { ...H, Cookie: cookie };
      const form = await fetch(`${BASE}/api/app/drafts/${drafts[i]}/form`, {
        method: 'PUT',
        headers: hc,
        body: JSON.stringify({
          familyName: 'LOAD',
          givenName: `USER${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`,
          birthDate: '1990-01-01',
          nationalityCode: 'MN',
          passportNumber: `E${String(1000000 + i)}`,
          passportExpiresOn: day(2000),
          contactEmail: email(i + 1),
          contactPhone: '+976 9900 0000',
          travelPurpose: 'Ачааллын туршилт',
          intendedEntryOn: day(30),
          intendedExitOn: day(40),
        }),
      });
      if (!form.ok) throw new Error(`анкет ${form.status}: ${await form.text()}`);
      for (const r of reqs) {
        const fd = new FormData();
        fd.append('requirementId', String(r.id));
        fd.append('file', new Blob([pdf(i, r.code)], { type: 'application/pdf' }), `${r.code}.pdf`);
        const up = await fetch(`${BASE}/api/app/drafts/${drafts[i]}/documents`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'civiz', Cookie: cookie },
          body: fd,
        });
        if (!up.ok) throw new Error(`файл ${up.status}: ${await up.text()}`);
      }
      const sub = await fetch(`${BASE}/api/app/drafts/${drafts[i]}/submit`, { method: 'POST', headers: hc });
      if (!sub.ok) throw new Error(`илгээх ${sub.status}: ${await sub.text()}`);
      return performance.now() - s;
    }),
  );
  return {
    n: SUBMIT,
    files: SUBMIT * reqs.length,
    totalMs: Math.round(performance.now() - t0),
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    max: Math.max(...ms),
  };
}
const submit = SUBMIT > 0 ? await submitAll(login.cookies, drafts) : null;

const rows = results.map(row);
const machine = `${os.cpus()[0]?.model?.trim()} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.type()} ${os.release()}, Node ${process.version}`;
console.log(`\nОрчин: ${machine}\n`);
console.log('| Хувилбар | Хүсэлт/сек | p50 мс | p90 мс | p99 мс | max мс | Нийт хүсэлт | 2xx биш | Алдаа |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
console.log(
  `| Нэвтрэлт: ${N} хэрэглэгч зэрэг (bcrypt 12) | — | ${Math.round(login.stats.p50)} | — | ${Math.round(login.stats.p95)} (p95) | ${Math.round(login.stats.max)} | ${N} | 0 | 0 |`,
);
for (const x of rows) {
  console.log(`| ${x.scenario} | ${x.rps} | ${x.p50} | ${x.p90} | ${x.p99} | ${x.max} | ${x.total} | ${x.non2xx} | ${x.errors} |`);
}
if (submit) {
  console.log(
    `| Бүтэн илгээлт: ${submit.n} мэдүүлэг зэрэг (анкет + ${submit.files} файл + илгээх) | — | ${Math.round(submit.p50)} | — | ${Math.round(submit.p95)} (p95) | ${Math.round(submit.max)} | ${submit.n} | 0 | 0 |`,
  );
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      base: BASE,
      users: N,
      connections: CONN,
      duration: DURATION,
      machine,
      login: login.stats,
      submit,
      rows,
    },
    null,
    2,
  ),
);
console.log(`\nДэлгэрэнгүй: ${path.relative(process.cwd(), file)}`);
const bad = rows.some((x) => x.non2xx > 0 || x.errors > 0);
process.exitCode = bad ? 1 : 0;
