// Үе 4: PDF хураангуй, анкетын автомат хадгалалт, ажлын жагсаалт (хайлт/эрэмбэ/хуудаслалт), олноор хуваарилах,
// статистик (хувийн мэдээлэлгүй), олон улс (код өөрчлөхгүй, тохиргоогоор).
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pool, one, query } from '../src/db.js';
import { config } from '../src/config.js';
import { setup, login, client, newApplicant, submitApplication, assign, review, validForm, DEMO, PDF, uuid } from './helpers.js';

let app, ids, admin, op, op2, me, other;
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
  op2 = await login(app, DEMO.operator2);
  me = (await newApplicant(app, 's4me')).c;
  other = (await newApplicant(app, 's4other')).c;
});
after(async () => {
  await pool.end();
});

describe('PDF хураангуй', () => {
  test('эзэмшигч татна (албан баримт биш); бусад 404; ажилтан 403; ноорог 404', async () => {
    const ref = await submitApplication(me, ids);
    const r = await binary(me.get(`/api/app/applications/${ref}/summary.pdf`));
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/pdf');
    assert.match(r.headers['content-disposition'], new RegExp(`${ref}-summary\\.pdf`));
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
    assert.ok(r.body.length > 2000);
    assert.ok(r.body.toString('latin1').includes('/Subject'), 'мета өгөгдөл');
    assert.equal((await other.get(`/api/app/applications/${ref}/summary.pdf`)).status, 404);
    assert.equal((await op.get(`/api/app/applications/${ref}/summary.pdf`)).status, 403);
    assert.equal((await admin.get(`/api/app/applications/${ref}/summary.pdf`)).status, 403);
    const d = (await me.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    assert.equal((await me.get(`/api/app/applications/${d}/summary.pdf`)).status, 404);
    assert.ok(await one("SELECT 1 AS x FROM audit_events WHERE action = 'APP_SUMMARY_PDF' AND entity_key = ?", [ref]));
  });
});

describe('Анкетын автомат хадгалалт', () => {
  let d;
  test('бүрэн бус анкетыг шифрлэж хадгална; ноорог нээхэд буцаана', async () => {
    d = (await me.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() })).body.publicId;
    const r = await me.put(`/api/app/drafts/${d}/autosave`, { familyName: 'Bat', passportNumber: 'ZX987654', travelPurpose: 'Аял' });
    assert.equal(r.status, 200);
    assert.ok(r.body.savedAt);
    const row = await one('SELECT form_autosave_enc FROM applications WHERE public_id = ?', [d]);
    assert.ok(!Buffer.from(row.form_autosave_enc).toString('latin1').includes('ZX987654'), 'шифрлэгдсэн');
    const g = (await me.get(`/api/app/drafts/${d}`)).body.draft;
    assert.equal(g.autosave.form.passportNumber, 'ZX987654');
    assert.equal(g.form, null);
  });

  test('танигдаагүй талбар 400; бусдынх 404; эцсийн хадгалалт автомат хадгалалтыг арилгана', async () => {
    assert.equal((await me.put(`/api/app/drafts/${d}/autosave`, { evil: 'x' })).status, 400);
    assert.equal((await other.put(`/api/app/drafts/${d}/autosave`, { familyName: 'X' })).status, 404);
    assert.equal((await me.put(`/api/app/drafts/${d}/form`, validForm())).status, 200);
    assert.equal((await me.get(`/api/app/drafts/${d}`)).body.draft.autosave, null);
    assert.equal((await one('SELECT form_autosave_enc FROM applications WHERE public_id = ?', [d])).form_autosave_enc, null);
  });
});

describe('Операторын ажлын жагсаалт', () => {
  let refs;
  before(async () => {
    refs = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await submitApplication(me, ids);
      await assign(admin, r, ids.opId);
      refs.push(r);
    }
  });

  test('хуудаслалт, нийт тоо, эрэмбэ, хайлт, төлөв', async () => {
    const p1 = (await op.get('/api/operator/applications?pageSize=2&page=1&sort=submitted_asc')).body;
    const p2 = (await op.get('/api/operator/applications?pageSize=2&page=2&sort=submitted_asc')).body;
    assert.ok(p1.total >= 3);
    assert.equal(p1.items.length, 2);
    assert.ok(!p2.items.some((x) => p1.items.find((y) => y.publicId === x.publicId)), 'хуудас давхцахгүй');
    const desc = (await op.get('/api/operator/applications?sort=submitted_desc')).body.items;
    assert.equal(desc[0].publicId, refs[2]);
    const found = (await op.get(`/api/operator/applications?q=${refs[1].slice(-6)}`)).body;
    assert.equal(found.total, 1);
    assert.equal(found.items[0].publicId, refs[1]);
    await review(op, refs[0], 'COMPLETE');
    const done = (await op.get('/api/operator/applications?status=COMPLETE')).body.items.map((x) => x.publicId);
    assert.ok(done.includes(refs[0]) && !done.includes(refs[1]));
    assert.equal((await op.get('/api/operator/applications?sort=x.public_id;DROP')).status, 400);
    assert.equal((await op2.get(`/api/operator/applications?q=${refs[1]}`)).body.total, 0, 'бусдын хуваарилалт харагдахгүй');
  });
});

describe('Олноор хуваарилах', () => {
  test('бүгд эсвэл юу ч биш; зөрсөнийг заана; эрх, хязгаар', async () => {
    const refs = [];
    for (let i = 0; i < 3; i += 1) refs.push(await submitApplication(other, ids));
    // Нэгийг нь өөр админ түрүүлж хуваарилсан (зэрэгцээ)
    await assign(admin, refs[1], ids.op2Id);
    const items = refs.map((publicId) => ({ publicId, expectedOperatorId: null }));
    const bad = await admin.put('/api/admin/assignments', { operatorId: ids.opId, items });
    assert.equal(bad.status, 409);
    assert.deepEqual(bad.body.error.conflicts, [refs[1]]);
    const st = await query('SELECT public_id, assigned_operator_id FROM applications WHERE public_id IN (?)', [refs]);
    assert.equal(st.find((x) => x.public_id === refs[0]).assigned_operator_id, null, 'буцаагдсан');

    const ok = await admin.put('/api/admin/assignments', {
      operatorId: ids.opId,
      items: [
        { publicId: refs[0], expectedOperatorId: null },
        { publicId: refs[1], expectedOperatorId: ids.op2Id },
        { publicId: refs[2], expectedOperatorId: null },
      ],
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const after = await query('SELECT status, assigned_operator_id FROM applications WHERE public_id IN (?)', [refs]);
    assert.ok(after.every((x) => x.assigned_operator_id === ids.opId && x.status === 'IN_REVIEW'));
    assert.ok((await op.get('/api/notifications')).body.items.filter((n) => n.kind === 'APP_ASSIGNED').length >= 3);

    assert.equal((await op.put('/api/admin/assignments', { operatorId: ids.opId, items })).status, 403);
    assert.equal((await me.put('/api/admin/assignments', { operatorId: ids.opId, items })).status, 403);
    const many = Array.from({ length: 101 }, (_, i) => ({ publicId: `KR-X-${i}`, expectedOperatorId: null }));
    assert.equal((await admin.put('/api/admin/assignments', { operatorId: ids.opId, items: many })).status, 400);
    assert.equal(
      (await admin.put('/api/admin/assignments', { operatorId: ids.adminId, items: [{ publicId: refs[0], expectedOperatorId: ids.opId }] }))
        .status,
      400,
      'оператор биш',
    );
  });
});

describe('Статистик', () => {
  test('долоо хоног/сараар нэгтгэл; хувийн мэдээлэл, лавлах дугаар агуулахгүй; админ л', async () => {
    const w = await admin.get('/api/admin/stats?period=week&count=12');
    assert.equal(w.status, 200);
    assert.equal(w.body.series.length, 12);
    // Сүүлийн 7 хоногийнх бүгд 12 долоо хоногийн цувралд орно; нийт илгээлтээс хэтрэхгүй
    const last7 = Number(
      (await one("SELECT COUNT(*) AS n FROM applications WHERE status <> 'DRAFT' AND submitted_at >= NOW() - INTERVAL 7 DAY")).n,
    );
    const all = Number((await one("SELECT COUNT(*) AS n FROM applications WHERE status <> 'DRAFT'")).n);
    const sum = w.body.series.reduce((s, x) => s + x.submitted, 0);
    assert.ok(sum >= last7 && sum <= all, `${last7} <= ${sum} <= ${all}`);
    assert.ok(w.body.timeToFirstReview.count >= 1);
    assert.ok(w.body.operators.some((o) => o.name === DEMO.operator.name && o.reviews >= 1));
    const json = JSON.stringify(w.body);
    assert.ok(!/KR-\d{8}-/.test(json), 'лавлах дугаар байхгүй');
    assert.ok(!json.includes('@'), 'имэйл байхгүй');
    assert.ok(!json.includes('Saran') && !json.includes('SARAN'), 'мэдүүлэгчийн нэр байхгүй');
    const m = await admin.get('/api/admin/stats?period=month&count=6');
    assert.equal(m.body.series.length, 6);
    assert.match(m.body.series[0].bucket, /^\d{4}-\d{2}$/);
    assert.equal((await op.get('/api/admin/stats')).status, 403);
    assert.equal((await admin.get('/api/admin/stats?period=year')).status, 400);
  });
});

describe('Олон улс — код өөрчлөхгүй, тохиргоогоор', () => {
  test('шинэ улс нэмж нийтлээд SUBMITTABLE_COUNTRIES-д оруулахад л мэдүүлэг авна', async () => {
    const c = await admin.post('/api/admin/countries', {
      isoCode: 'JP',
      nameMn: 'Япон',
      serviceStatus: 'ACTIVE',
      officialResultUrl: 'https://www.mofa.go.jp/j_info/visit/visa/',
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const t = await admin.post('/api/admin/visa-types', { countryId: c.body.id, code: 'TEMP-VISITOR', isActive: true });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const v = await admin.post(`/api/admin/visa-types/${t.body.id}/versions`, {
      nameMn: 'Богино хугацааны зочин (туршилт)',
      sourceUrl: 'https://www.mofa.go.jp/j_info/visit/visa/short/index.html',
      verifiedAt: '2026-11-01',
    });
    const vid = v.body.id;
    const rq = await admin.post(`/api/admin/versions/${vid}/requirements`, {
      code: 'PASSPORT_COPY',
      title: 'Паспортын хуулбар',
      isRequired: true,
    });
    assert.equal(rq.status, 201);
    assert.equal((await admin.post(`/api/admin/versions/${vid}/publish`)).status, 200);

    // Тохиргоонд ороогүй үед харагдана, гэхдээ мэдүүлэг авахгүй (BR-03)
    const pub = (await client(app).get(`/api/visas/${vid}`)).body.visa;
    assert.equal(pub.canApply, false);
    assert.equal((await me.post('/api/app/drafts', { versionId: vid, idempotencyKey: uuid() })).status, 403);

    config.submittableCountries.push('JP');
    try {
      assert.equal((await client(app).get(`/api/visas/${vid}`)).body.visa.canApply, true);
      const d = await me.post('/api/app/drafts', { versionId: vid, idempotencyKey: uuid() });
      assert.equal(d.status, 201);
      assert.match(d.body.publicId, /^JP-\d{8}-/);
      await me.put(`/api/app/drafts/${d.body.publicId}/form`, validForm());
      await me.multipart(`/api/app/drafts/${d.body.publicId}/documents`, { requirementId: rq.body.id }, [{ buf: PDF, name: 'p.pdf' }]);
      const s = await me.post(`/api/app/drafts/${d.body.publicId}/submit`);
      assert.equal(s.status, 201, JSON.stringify(s.body));
      const countries = (await client(app).get('/api/countries')).body.countries;
      assert.ok(countries.find((x) => x.iso === 'JP').submittable);
      await assign(admin, d.body.publicId, ids.opId);
      await review(op, d.body.publicId, 'COMPLETE');
    } finally {
      config.submittableCountries.splice(config.submittableCountries.indexOf('JP'), 1);
    }
  });
});
