// Үе 1: нэмэлт материал (F07), хүргүүлсэн (4.2/5.3), албан үр дүн (F11), импорт (4.5) — эрх, бүрэн байдал, сөрөг тест.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, query, one } from '../src/db.js';
import { config } from '../src/config.js';
import { setup, login, newApplicant, submitApplication, assign, review, DEMO, PDF, PNG, uuid, future } from './helpers.js';

let app, ids, admin, op, op2, me, other, ref;
const today = () => new Date().toISOString().slice(0, 10);
const fileOnDisk = async (key) =>
  fs
    .access(path.join(config.storageDir, key.slice(0, 2), key))
    .then(() => true)
    .catch(() => false);

before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
  op = await login(app, DEMO.operator);
  op2 = await login(app, DEMO.operator2);
  me = (await newApplicant(app, 'me')).c;
  other = (await newApplicant(app, 'other')).c;
  ref = await submitApplication(me, ids);
  await assign(admin, ref, ids.opId);
});
after(async () => {
  await pool.end();
});

describe('Үе 1.1 Нэмэлт материалын багц', () => {
  let originalDocs;
  let supDocId;

  test('“Дутуу” үнэлгээгүй үед багц эхлүүлэхгүй (409)', async () => {
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements`)).status, 409);
  });

  test('“Дутуу”-гийн дараа багц эхлүүлнэ; давтан дарахад ижил ноорог', async () => {
    await review(op, ref, 'INCOMPLETE', 'Банкны хуулга 3 сарын байх.');
    originalDocs = (await me.get(`/api/app/applications/${ref}`)).body.application.documents;
    const a = await me.post(`/api/app/applications/${ref}/supplements`);
    assert.equal(a.status, 201);
    assert.equal(a.body.roundNo, 1);
    const b = await me.post(`/api/app/applications/${ref}/supplements`);
    assert.equal(b.status, 200);
    assert.equal(b.body.roundNo, 1);
  });

  test('BR-02: бусдын мэдүүлэгт багц/файл — 404; оператор мэдүүлэгчийн API — 403', async () => {
    assert.equal((await other.post(`/api/app/applications/${ref}/supplements`)).status, 404);
    const up = await other.multipart(`/api/app/applications/${ref}/supplements/1/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
      { buf: PDF, name: 'x.pdf' },
    ]);
    assert.equal(up.status, 404);
    assert.equal((await op.post(`/api/app/applications/${ref}/supplements`)).status, 403);
  });

  test('файлгүй багцыг илгээхгүй (422); буруу төрлийн файл 400', async () => {
    const s = await me.post(`/api/app/applications/${ref}/supplements/1/submit`);
    assert.equal(s.status, 422);
    assert.equal(s.body.error.missing[0].step, 'documents');
    const bad = await me.multipart(`/api/app/applications/${ref}/supplements/1/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
      { buf: Buffer.from('MZ fake exe'), name: 'bank.pdf' },
    ]);
    assert.equal(bad.status, 400);
  });

  test('ноорог багцын файлыг оператор харахгүй; мэдүүлэгч харна', async () => {
    const up = await me.multipart(`/api/app/applications/${ref}/supplements/1/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
      { buf: PDF, name: 'bank-3m.pdf' },
    ]);
    assert.equal(up.status, 201, JSON.stringify(up.body));
    supDocId = up.body.document.id;
    assert.equal((await me.get(`/api/files/${supDocId}`)).status, 200);
    assert.equal((await op.get(`/api/files/${supDocId}`)).status, 403);
    const detail = (await op.get(`/api/operator/applications/${ref}`)).body.application;
    assert.equal(detail.supplements.length, 0, 'оператор ноорог багц харахгүй');
  });

  test('илгээх: нэг транзакц, төлөв IN_REVIEW, давтан хүсэлт ижил үр дүн; анхны хавсралт хэвээр (BR-07)', async () => {
    assert.equal((await me.put(`/api/app/applications/${ref}/supplements/1`, { note: 'Шинэ хуулга хавсаргав.' })).status, 200);
    const results = await Promise.all(Array.from({ length: 5 }, () => me.post(`/api/app/applications/${ref}/supplements/1/submit`)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.every((r) => [200, 201].includes(r.status)));
    const a = (await me.get(`/api/app/applications/${ref}`)).body.application;
    assert.equal(a.status, 'IN_REVIEW');
    assert.deepEqual(
      a.documents.map((d) => d.id),
      originalDocs.map((d) => d.id),
    );
    assert.equal(a.supplements[0].status, 'SUBMITTED');
    assert.equal(a.supplements[0].documents.length, 1);
    assert.equal(a.supplements[0].note, 'Шинэ хуулга хавсаргав.');
  });

  test('илгээсэн багцыг өөрчлөхгүй (409); оператор одоо харж, файлыг нээнэ', async () => {
    const up = await me.multipart(`/api/app/applications/${ref}/supplements/1/documents`, { requirementId: ids.reqIds.FINANCIAL }, [
      { buf: PDF, name: 'late.pdf' },
    ]);
    assert.equal(up.status, 409);
    assert.equal((await me.del(`/api/app/applications/${ref}/supplements/1/documents/${supDocId}`)).status, 409);
    assert.equal((await me.del(`/api/app/applications/${ref}/supplements/1`)).status, 409);
    const d = (await op.get(`/api/operator/applications/${ref}`)).body.application;
    assert.equal(d.supplements.length, 1);
    assert.equal((await op.get(`/api/files/${supDocId}`)).status, 200);
    assert.equal((await op2.get(`/api/files/${supDocId}`)).status, 403);
    assert.equal((await admin.get(`/api/files/${supDocId}`)).status, 403);
  });

  test('ноорог багцыг цуцлахад файлууд дискнээс устна; анхны илгээлт хэвээр', async () => {
    await review(op, ref, 'INCOMPLETE', 'Зураг тодорхой биш.');
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements`)).body.roundNo, 2);
    const up = await me.multipart(`/api/app/applications/${ref}/supplements/2/documents`, { requirementId: ids.reqIds.FORM_PHOTO }, [
      { buf: PNG, name: 'p.png' },
    ]);
    const key = (await one('SELECT storage_key FROM application_documents WHERE document_id = ?', [up.body.document.id])).storage_key;
    assert.ok(await fileOnDisk(key));
    assert.equal((await me.del(`/api/app/applications/${ref}/supplements/2`)).status, 200);
    assert.equal(await fileOnDisk(key), false);
    assert.equal(
      Number(
        (
          await one(
            'SELECT COUNT(*) AS n FROM application_documents WHERE supplement_id IS NULL AND application_id = (SELECT application_id FROM applications WHERE public_id = ?)',
            [ref],
          )
        ).n,
      ),
      3,
    );
  });

  test('ноорог байх хооронд шинэ “Дутуу” үнэлгээ → ноорог хамгийн сүүлийн хүсэлтэд шилжинэ', async () => {
    const round = (await me.post(`/api/app/applications/${ref}/supplements`)).body.roundNo;
    await me.multipart(`/api/app/applications/${ref}/supplements/${round}/documents`, { requirementId: ids.reqIds.FORM_PHOTO }, [
      { buf: PNG, name: 'p2.png' },
    ]);
    await review(op, ref, 'INCOMPLETE', 'Мөн паспортын хуулбар.');
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements/${round}/submit`)).status, 409, 'хуучин хүсэлтэд хариулахгүй');
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements`)).body.roundNo, round);
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements/${round}/submit`)).status, 201);
  });

  test('“Бүрэн” болсны дараа багц эхлүүлэхгүй', async () => {
    await review(op, ref, 'COMPLETE');
    assert.equal((await me.post(`/api/app/applications/${ref}/supplements`)).status, 409);
  });
});

describe('Үе 1.4 Хүргүүлсэн (DELIVERED)', () => {
  const fields = () => ({ authority: 'KVAC Mongolia', officialRef: 'KVAC-2026-000123', deliveredOn: today() });

  test('зөвхөн хуваарилагдсан оператор (бусад 403); мэдүүлэгч/админ API-д хандахгүй', async () => {
    const f = [{ buf: PDF, name: 'receipt.pdf' }];
    assert.equal((await op2.multipart(`/api/operator/applications/${ref}/handover`, fields(), f)).status, 403);
    assert.equal((await me.multipart(`/api/operator/applications/${ref}/handover`, fields(), f)).status, 403);
    assert.equal((await admin.multipart(`/api/operator/applications/${ref}/handover`, fields(), f)).status, 403);
  });

  test('нотолгоо файл, албан дугаар заавал; ирээдүйн огноо хүлээхгүй', async () => {
    assert.equal((await op.multipart(`/api/operator/applications/${ref}/handover`, fields(), [])).status, 400);
    const noRef = await op.multipart(`/api/operator/applications/${ref}/handover`, { ...fields(), officialRef: '' }, [
      { buf: PDF, name: 'r.pdf' },
    ]);
    assert.equal(noRef.status, 400);
    assert.ok(noRef.body.error.fields.officialRef);
    const fut = await op.multipart(`/api/operator/applications/${ref}/handover`, { ...fields(), deliveredOn: future(3) }, [
      { buf: PDF, name: 'r.pdf' },
    ]);
    assert.equal(fut.status, 400);
  });

  test('“Бүрэн”-ээс бусад төлөвт хүргүүлэхгүй (409)', async () => {
    const ref2 = await submitApplication(me, ids);
    await assign(admin, ref2, ids.opId);
    const r = await op.multipart(`/api/operator/applications/${ref2}/handover`, fields(), [{ buf: PDF, name: 'r.pdf' }]);
    assert.equal(r.status, 409);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM evidence_files')).n), 0, 'бүтэлгүй хүсэлт файл үлдээхгүй');
  });

  test('бүртгэнэ → DELIVERED; давтахгүй; дараа нь үнэлгээ нэмэхгүй', async () => {
    const r = await op.multipart(`/api/operator/applications/${ref}/handover`, fields(), [{ buf: PDF, name: 'receipt.pdf' }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const again = await op.multipart(`/api/operator/applications/${ref}/handover`, fields(), [{ buf: PDF, name: 'receipt.pdf' }]);
    assert.equal(again.status, 409);
    const a = (await op.get(`/api/operator/applications/${ref}`)).body.application;
    assert.equal(a.status, 'DELIVERED');
    const rv = await op.post(`/api/operator/applications/${ref}/reviews`, {
      completeness: 'COMPLETE',
      expectedReviewNo: a.reviews[0].reviewNo,
    });
    assert.equal(rv.status, 409);
  });

  test('мэдүүлэгч албан дугаар, нотолгоог харна; бусад оператор/админ нотолгоо файлыг үзэхгүй', async () => {
    const a = (await me.get(`/api/app/applications/${ref}`)).body.application;
    assert.equal(a.handover.officialRef, 'KVAC-2026-000123');
    assert.equal(a.statusLabel, 'Эрх бүхий байгууллагад хүргүүлсэн');
    const fid = a.handover.evidence.id;
    assert.equal((await me.get(`/api/files/evidence/${fid}`)).status, 200);
    assert.equal((await op.get(`/api/files/evidence/${fid}`)).status, 200);
    assert.equal((await op2.get(`/api/files/evidence/${fid}`)).status, 403);
    assert.equal((await admin.get(`/api/files/evidence/${fid}`)).status, 403);
    assert.equal((await other.get(`/api/files/evidence/${fid}`)).status, 404);
  });
});

describe('Үе 1.2 Албан ёсны үр дүн (F11)', () => {
  const base = () => ({ outcome: 'PENDING', checkedOn: today(), source: 'Korea Visa Portal', idempotencyKey: uuid() });

  test('мэдүүлэгч бүртгэнэ; давтан хүсэлт (ижил түлхүүр) шинэ бичлэг үүсгэхгүй', async () => {
    const f = base();
    const a = await me.multipart(`/api/app/applications/${ref}/official-results`, f);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.entryNo, 1);
    const b = await me.multipart(`/api/app/applications/${ref}/official-results`, f);
    assert.equal(b.status, 200);
    assert.equal(b.body.entryNo, 1);
  });

  test('шалгалт: HTTPS холбоос, ирээдүйн огноо, буруу утга', async () => {
    assert.equal(
      (await me.multipart(`/api/app/applications/${ref}/official-results`, { ...base(), sourceUrl: 'http://visa.go.kr' })).status,
      400,
    );
    assert.equal((await me.multipart(`/api/app/applications/${ref}/official-results`, { ...base(), checkedOn: future(2) })).status, 400);
    assert.equal((await me.multipart(`/api/app/applications/${ref}/official-results`, { ...base(), outcome: 'MAYBE' })).status, 400);
  });

  test('нотолгоо файлтай бичлэг; бусад мэдүүлэгч 404; оператор бүртгэхгүй (403)', async () => {
    const r = await me.multipart(
      `/api/app/applications/${ref}/official-results`,
      { ...base(), outcome: 'APPROVED', sourceUrl: 'https://www.visa.go.kr/openPage.do?MENU_ID=10301' },
      [{ buf: PNG, name: 'portal.png' }],
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.entryNo, 2);
    assert.equal((await other.multipart(`/api/app/applications/${ref}/official-results`, base())).status, 404);
    assert.equal((await op.multipart(`/api/app/applications/${ref}/official-results`, base())).status, 403);
  });

  test('засах/устгах API байхгүй (зөвхөн нэмэгдэнэ)', async () => {
    assert.equal((await me.put(`/api/app/applications/${ref}/official-results/1`, { outcome: 'REFUSED' })).status, 404);
    assert.equal((await me.del(`/api/app/applications/${ref}/official-results/1`)).status, 404);
  });

  test('оператор: нотолгоогүй бичлэгийг тулгахгүй; таараагүй бол тайлбар заавал; нэг удаа', async () => {
    const url = (n) => `/api/operator/applications/${ref}/official-results/${n}/verification`;
    assert.equal((await op.post(url(1), { verdict: 'MATCHES' })).status, 409);
    assert.equal((await op.post(url(2), { verdict: 'MISMATCH' })).status, 400);
    assert.equal((await op2.post(url(2), { verdict: 'MATCHES' })).status, 403);
    assert.equal((await op.post(url(2), { verdict: 'MATCHES' })).status, 201);
    assert.equal((await op.post(url(2), { verdict: 'MATCHES' })).status, 409);
    assert.equal((await op.post(url(99), { verdict: 'MATCHES' })).status, 404);
  });

  test('мэдүүлэгчийн бичлэг тулгалтаар өөрчлөгдөхгүй; дэлгэрэнгүйд тусдаа харагдана', async () => {
    const rows = await query(
      'SELECT entry_no, outcome, source FROM official_results r JOIN applications a ON a.application_id = r.application_id WHERE a.public_id = ? ORDER BY entry_no',
      [ref],
    );
    assert.deepEqual(
      rows.map((x) => [x.entry_no, x.outcome]),
      [
        [1, 'PENDING'],
        [2, 'APPROVED'],
      ],
    );
    const a = (await me.get(`/api/app/applications/${ref}`)).body.application;
    assert.equal(a.officialResults[0].entryNo, 2);
    assert.equal(a.officialResults[0].verification.verdict, 'MATCHES');
    assert.equal(a.officialResults[1].verification, null);
    assert.match(a.officialResults[0].outcomeLabel, /мэдүүлэгчийн мэдээлснээр/);
    const ev = a.officialResults[0].evidence.id;
    assert.equal((await admin.get(`/api/files/evidence/${ev}`)).status, 403);
  });
});

describe('Үе 1.3 Өмнөх мэдүүлэг импортлох', () => {
  const fields = () => ({
    countryName: 'БНСУ',
    visaCategory: 'C-3-9',
    appliedOn: '2024-03-15',
    authority: 'KVAC',
    officialRef: 'OLD-2024-777',
    outcome: 'APPROVED',
    idempotencyKey: uuid(),
  });
  let imp;
  let keys;

  test('файлтай нэмнэ; давтан хүсэлт ижил бичлэг', async () => {
    const f = fields();
    const files = [
      { field: 'files', buf: PDF, name: 'old-receipt.pdf' },
      { field: 'files', buf: PNG, name: 'old-visa.png' },
    ];
    const a = await me.multipart('/api/app/imports', f, files);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.match(a.body.publicId, /^IMP-\d{8}-[A-Z0-9]{6}$/);
    imp = a.body.publicId;
    const b = await me.multipart('/api/app/imports', f, files);
    assert.equal(b.status, 200);
    assert.equal(b.body.publicId, imp);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM evidence_files WHERE kind = ?', ['IMPORT'])).n), 2);
  });

  test('“импортолсон, баталгаажаагүй” тэмдэгтэй; эзэмшигч л харна', async () => {
    const list = (await me.get('/api/app/imports')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].imported, true);
    assert.equal(list[0].verified, false);
    const d = await me.get(`/api/app/imports/${imp}`);
    assert.equal(d.status, 200);
    assert.equal(d.body.item.files.length, 2);
    keys = await query('SELECT file_id, storage_key FROM evidence_files WHERE kind = ?', ['IMPORT']);
    assert.equal((await me.get(`/api/files/evidence/${keys[0].file_id}`)).status, 200);
    assert.equal((await other.get(`/api/app/imports/${imp}`)).status, 404);
    assert.equal((await other.get(`/api/files/evidence/${keys[0].file_id}`)).status, 404);
    assert.equal((await op.get('/api/app/imports')).status, 403);
    assert.equal((await op.get(`/api/files/evidence/${keys[0].file_id}`)).status, 403);
    assert.equal((await admin.get(`/api/files/evidence/${keys[0].file_id}`)).status, 403);
  });

  test('оператор/админы жагсаалтад импорт орохгүй', async () => {
    const opList = (await op.get('/api/operator/applications')).body.items.map((x) => x.publicId);
    const adm = (await admin.get('/api/admin/assignments?filter=all')).body.items.map((x) => x.publicId);
    assert.ok(!opList.includes(imp) && !adm.includes(imp));
  });

  test('буруу файл эсвэл хэт олон файл → 400, бичлэг үүсэхгүй', async () => {
    const bad = await me.multipart('/api/app/imports', fields(), [{ field: 'files', buf: Buffer.from('<html>'), name: 'x.pdf' }]);
    assert.equal(bad.status, 400);
    const many = Array.from({ length: 11 }, (_, i) => ({ field: 'files', buf: PDF, name: `f${i}.pdf` }));
    assert.equal((await me.multipart('/api/app/imports', fields(), many)).status, 400);
    assert.equal((await me.get('/api/app/imports')).body.items.length, 1);
    assert.equal((await me.multipart('/api/app/imports', { ...fields(), appliedOn: future(5) })).status, 400);
  });

  test('устгахад файлууд дискнээс устна; бусад хүн устгахгүй', async () => {
    assert.equal((await other.del(`/api/app/imports/${imp}`)).status, 404);
    assert.equal((await me.del(`/api/app/imports/${imp}`)).status, 200);
    assert.equal((await me.get(`/api/app/imports/${imp}`)).status, 404);
    for (const k of keys) assert.equal(await fileOnDisk(k.storage_key), false);
  });
});

describe('Audit — Үе 1-ийн үйлдэлд нууц мэдээлэл байхгүй', () => {
  test('шинэ үйлдлүүд бүртгэгдсэн; албан дугаар, тайлбар audit-д ороогүй', async () => {
    const actions = (await query('SELECT DISTINCT action FROM audit_events')).map((x) => x.action);
    for (const a of [
      'SUPPLEMENT_CREATE',
      'SUPPLEMENT_SUBMIT',
      'HANDOVER_RECORD',
      'OFFICIAL_RESULT_RECORD',
      'OFFICIAL_RESULT_VERIFY',
      'IMPORT_CREATE',
      'IMPORT_DELETE',
    ]) {
      assert.ok(actions.includes(a), `${a} бүртгэгдээгүй`);
    }
    const leaks = await one(
      "SELECT COUNT(*) AS n FROM audit_events WHERE entity_key LIKE '%KVAC-2026%' OR entity_key LIKE '%OLD-2024%' OR entity_key LIKE '%хуулга%'",
    );
    assert.equal(Number(leaks.n), 0);
  });
});
