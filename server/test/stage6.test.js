// Профайл, бичиг баримтын сан, профайлаас автоматаар бөглөх (файлыг ХУУЛАХ), шаардлага ↔ баримтын төрөл,
// “Мэдээллээ татах” — нэг PDF (кирилл текст, хавсралт нэгтгэсэн, хуудас бүрт “АЛБАН БАРИМТ БИШ”).
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pool, one, query } from '../src/db.js';
import { readFile } from '../src/lib/storage.js';
import { expiryStatus, EXPIRY_WARN_DAYS } from '../src/lib/profile.js';
import { setup, login, newApplicant, submitApplication, assign, review, validForm, DEMO, PNG, uuid } from './helpers.js';

let app, ids, admin, op;
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
const binary = (r) =>
  r.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

/** Хүчинтэй жижиг PDF (тэмдэгт тексттэй) — нэгтгэсэн эсэхийг текстээр шалгана */
async function markerPdf(marker) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([300, 200]).drawText(marker, { x: 20, y: 100, size: 14, font: f });
  return Buffer.from(await d.save());
}

/** PDF-ийн хуудас бүрийн текст (pdfjs) */
async function pdfText(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map((x) => x.str).join(' '));
  }
  await doc.destroy();
  return pages;
}

const PROFILE = {
  familyName: 'Bat',
  givenName: 'Erdene',
  birthDate: '1994-05-06',
  sex: 'M',
  nationalityCode: 'mn',
  maritalStatus: 'MARRIED',
  passportNumber: 'e7766554',
  passportIssuedOn: '2022-01-10',
  passportExpiresOn: day(2000),
  contactEmail: 'bat.profile@example.com',
  contactPhone: '+976 9911 2233',
  homeAddress: 'Улаанбаатар, СБД',
  occupation: 'Инженер',
  employerOrSchool: 'Монгол Компани ХХК',
};

async function uploadVault(c, typeCode, buf, name, extra = {}) {
  const r = await c.multipart('/api/app/profile/documents', { typeCode, ...extra }, [{ buf, name }]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.document;
}

before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
  op = await login(app, DEMO.operator);
});
after(async () => {
  await pool.end();
});

describe('Профайл — хувийн мэдээлэл', () => {
  test('хадгалах/унших; паспорт шифрлэгдэнэ; латин нэр, огнооны шалгалт; audit агуулгагүй', async () => {
    const { c } = await newApplicant(app, 'prof1');
    const empty = await c.get('/api/app/profile');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.profile.familyName, '');
    const bad = await c.put('/api/app/profile', { ...PROFILE, familyName: 'Бат' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.familyName);
    const badDates = await c.put('/api/app/profile', { ...PROFILE, passportExpiresOn: '2021-01-01' });
    assert.equal(badDates.status, 400);
    assert.ok(badDates.body.error.fields.passportExpiresOn, 'дуусах < олгосон');
    const ok = await c.put('/api/app/profile', PROFILE);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.profile.familyName, 'BAT');
    assert.equal(ok.body.profile.passportNumber, 'E7766554');
    assert.equal(ok.body.profile.nationalityCode, 'MN');
    const row = await one(
      'SELECT p.passport_number_enc FROM applicant_profiles p JOIN users u ON u.user_id = p.user_id WHERE u.email = ?',
      ['t.prof1@example.com'],
    );
    assert.ok(!Buffer.from(row.passport_number_enc).toString('latin1').includes('E7766554'), 'шифрлэгдсэн');
    const ev = await one("SELECT * FROM audit_events WHERE action = 'PROFILE_UPDATE' ORDER BY event_id DESC LIMIT 1");
    assert.ok(!JSON.stringify(ev).includes('E7766554'));
    // Хоосон утгаар цэвэрлэнэ
    const cleared = await c.put('/api/app/profile', { ...PROFILE, occupation: '', sex: '' });
    assert.equal(cleared.body.profile.occupation, '');
    assert.equal(cleared.body.profile.sex, '');
  });

  test('ажилтан профайл API-д хандахгүй', async () => {
    assert.equal((await op.get('/api/app/profile')).status, 403);
    assert.equal((await admin.get('/api/app/profile')).status, 403);
  });

  test('prefill: анкетын хэлбэрт, хоосон талбаргүй; хугацаа дууссан паспортын огноог санал болгохгүй', async () => {
    const { c } = await newApplicant(app, 'prof2');
    await c.put('/api/app/profile', PROFILE);
    const p = (await c.get('/api/app/profile/prefill')).body;
    assert.equal(p.form.familyName, 'BAT');
    assert.equal(p.form.passportNumber, 'E7766554');
    assert.equal(p.form.extraFields.employerOrSchool, 'Монгол Компани ХХК');
    assert.equal(p.form.extraFields.sex, 'M');
    assert.equal(p.form.travelPurpose, undefined, 'аяллын мэдээлэл профайлд байхгүй');
    assert.ok(p.filled.includes('passportNumber'));
    await c.put('/api/app/profile', { ...PROFILE, passportIssuedOn: '2010-01-01', passportExpiresOn: '2020-01-01' });
    const p2 = (await c.get('/api/app/profile/prefill')).body;
    assert.equal(p2.form.passportExpiresOn, undefined);
    assert.equal(p2.passportExpired, true);
    const w = (await c.get('/api/app/profile')).body.warnings;
    assert.ok(w.some((x) => x.kind === 'PASSPORT' && x.status === 'EXPIRED'));
  });

  test('анкет шинэ талбаруудыг (хүйс, гэр бүл, паспорт олгосон, ажил/сургууль) хүлээн авч, шалгана', async () => {
    const { c } = await newApplicant(app, 'prof3');
    const d = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() });
    const ref = d.body.publicId;
    const f = validForm();
    const bad = await c.put(`/api/app/drafts/${ref}/form`, {
      ...f,
      extraFields: { ...f.extraFields, sex: 'X', passportIssuedOn: f.passportExpiresOn },
    });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields['extraFields.sex']);
    const ok = await c.put(`/api/app/drafts/${ref}/form`, {
      ...f,
      extraFields: { ...f.extraFields, sex: 'F', maritalStatus: 'SINGLE', passportIssuedOn: '2020-02-02', employerOrSchool: 'МУИС' },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const got = (await c.get(`/api/app/drafts/${ref}`)).body;
    assert.equal(JSON.stringify(got).includes('МУИС'), true);
  });
});

describe('Бичиг баримтын сан', () => {
  test('хадгалах, хугацааны анхааруулга, файлын дүрэм, зөвхөн эзэмшигч', async () => {
    const { c } = await newApplicant(app, 'vault1');
    const other = (await newApplicant(app, 'vault1b')).c;
    const types = (await c.get('/api/app/profile')).body.documentTypes.map((t) => t.code);
    assert.ok(
      ['PASSPORT_COPY', 'PHOTO', 'BANK_STATEMENT', 'EMPLOYMENT_CERT', 'FAMILY_CERT', 'SCHOOL_CERT'].every((x) => types.includes(x)),
    );

    const fake = await c.multipart('/api/app/profile/documents', { typeCode: 'PHOTO' }, [
      { buf: Buffer.from('not a png at all'), name: 'x.png' },
    ]);
    assert.equal(fake.status, 400, 'magic byte');
    assert.equal((await c.multipart('/api/app/profile/documents', { typeCode: 'NOPE' }, [{ buf: PNG, name: 'p.png' }])).status, 400);

    const expired = await uploadVault(c, 'BANK_STATEMENT', await markerPdf('BANK'), 'bank.pdf', { validUntil: day(-1) });
    const soon = await uploadVault(c, 'EMPLOYMENT_CERT', await markerPdf('EMP'), 'emp.pdf', { validUntil: day(EXPIRY_WARN_DAYS - 1) });
    const photo = await uploadVault(c, 'PHOTO', PNG, 'photo.png');
    assert.equal(expired.expiry, 'EXPIRED');
    assert.equal(soon.expiry, 'EXPIRING');
    assert.equal(photo.expiry, 'NO_EXPIRY');
    const prof = (await c.get('/api/app/profile')).body;
    assert.equal(prof.documents.length, 3);
    assert.deepEqual(prof.warnings.map((w) => w.status).sort(), ['EXPIRED', 'EXPIRING']);

    // Файл: эзэмшигч нээнэ; бусад мэдүүлэгч 404; оператор/админ 403
    assert.equal((await binary(c.get(`/api/files/profile/${photo.id}`))).status, 200);
    assert.equal((await other.get(`/api/files/profile/${photo.id}`)).status, 404);
    assert.equal((await op.get(`/api/files/profile/${photo.id}`)).status, 403);
    assert.equal((await admin.get(`/api/files/profile/${photo.id}`)).status, 403);
    assert.equal((await other.del(`/api/app/profile/documents/${photo.id}`)).status, 404);

    const upd = await c.put(`/api/app/profile/documents/${expired.id}`, { typeCode: 'BANK_STATEMENT', validUntil: day(90) });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.document.expiry, 'VALID');
    assert.equal((await c.del(`/api/app/profile/documents/${soon.id}`)).status, 200);
    assert.equal((await c.get('/api/app/profile')).body.documents.length, 2);
  });

  test('expiryStatus хил', () => {
    assert.equal(expiryStatus(null), 'NO_EXPIRY');
    assert.equal(expiryStatus('2000-01-01', '2000-01-02'), 'EXPIRED');
    assert.equal(expiryStatus('2000-01-02', '2000-01-02'), 'EXPIRING');
    assert.equal(expiryStatus('2001-01-01', '2000-01-02'), 'VALID');
  });
});

describe('Профайлаас автоматаар хавсаргах', () => {
  test('тохирох баримтыг ХУУЛЖ хавсаргана; хугацаа дууссаныг алгасна; эх баримт устсан ч илгээсэн мэдүүлэг хэвээр', async () => {
    const { c } = await newApplicant(app, 'auto1');
    const photo = await uploadVault(c, 'PHOTO', PNG, 'me.png');
    const pass = await uploadVault(c, 'PASSPORT_COPY', await markerPdf('PASSPORT'), 'pass.pdf', { validUntil: day(800) });
    await uploadVault(c, 'BANK_STATEMENT', await markerPdf('OLD-BANK'), 'bank-old.pdf', { validUntil: day(-5) });
    const emp = await uploadVault(c, 'EMPLOYMENT_CERT', await markerPdf('EMPLOYER'), 'emp.pdf');

    const d = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() });
    const ref = d.body.publicId;
    const matches = (await c.get(`/api/app/drafts/${ref}/document-matches`)).body.requirementTypes;
    assert.deepEqual(matches[ids.reqIds.FINANCIAL].sort(), ['BANK_STATEMENT', 'EMPLOYMENT_CERT']);

    const r = await c.post(`/api/app/drafts/${ref}/autofill-documents`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const attachedTypes = r.body.attached.map((x) => x.typeCode).sort();
    assert.deepEqual(attachedTypes, ['EMPLOYMENT_CERT', 'PASSPORT_COPY', 'PHOTO']);
    assert.ok(r.body.skipped.some((x) => x.typeCode === 'BANK_STATEMENT' && x.reason === 'EXPIRED'));
    assert.ok(r.body.missing.some((x) => x.requirementId === ids.reqIds.FAMILY));

    // Шинэ storage_key, ижил SHA-256, профайлаас гэж тэмдэглэгдсэн
    const docs = await query(
      'SELECT * FROM application_documents WHERE application_id = (SELECT application_id FROM applications WHERE public_id = ?)',
      [ref],
    );
    const src = await query('SELECT * FROM profile_documents WHERE document_id IN (?)', [[photo.id, pass.id, emp.id]]);
    for (const x of docs) {
      const s = src.find((p) => p.document_id === x.source_profile_document_id);
      assert.ok(s);
      assert.notEqual(x.storage_key, s.storage_key);
      assert.equal(x.sha256, s.sha256);
    }
    // Давтан дуудахад давхардахгүй (шаардлага бөглөгдсөн)
    assert.equal((await c.post(`/api/app/drafts/${ref}/autofill-documents`)).body.attached.length, 0);

    // Илгээгээд профайлын баримтыг устгана — мэдүүлгийн хуулбар үлдэнэ (BR-07)
    assert.equal((await c.put(`/api/app/drafts/${ref}/form`, validForm())).status, 200);
    const s = await c.post(`/api/app/drafts/${ref}/submit`);
    assert.equal(s.status, 201, JSON.stringify(s.body));
    const passCopy = docs.find((x) => x.source_profile_document_id === pass.id);
    assert.equal((await c.del(`/api/app/profile/documents/${pass.id}`)).status, 200);
    const buf = await readFile(passCopy.storage_key);
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), passCopy.sha256, 'хуулбар бүрэн бүтэн');
    const detail = (await c.get(`/api/app/applications/${ref}`)).body.application;
    assert.equal(detail.documents.filter((x) => x.fromProfile).length, 3);
  });

  test('бусдын ноорогт, илгээсэн мэдүүлэгт ажиллахгүй', async () => {
    const { c } = await newApplicant(app, 'auto2');
    const other = (await newApplicant(app, 'auto2b')).c;
    const d = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() });
    assert.equal((await other.post(`/api/app/drafts/${d.body.publicId}/autofill-documents`)).status, 404);
    const ref = await submitApplication(c, ids);
    assert.equal((await c.post(`/api/app/drafts/${ref}/autofill-documents`)).status, 404);
  });
});

describe('Админ: шаардлага ↔ баримтын төрөл', () => {
  test('нийтэлсэн хувилбарт ч тохируулна (audit); буруу төрөл 400; хуулбар хувилбарт хамт хуулагдана', async () => {
    const v = (await admin.get(`/api/admin/versions/${ids.versionId}`)).body;
    assert.ok(v.documentTypes.length >= 6);
    const fin = v.requirements.find((x) => x.code === 'FINANCIAL');
    assert.deepEqual(fin.documentTypes.sort(), ['BANK_STATEMENT', 'EMPLOYMENT_CERT']);
    assert.equal((await admin.put(`/api/admin/requirements/${fin.id}/document-types`, { typeCodes: ['NOPE'] })).status, 400);
    const r = await admin.put(`/api/admin/requirements/${fin.id}/document-types`, {
      typeCodes: ['BANK_STATEMENT', 'EMPLOYMENT_CERT', 'OTHER'],
    });
    assert.equal(r.status, 200);
    assert.ok(await one("SELECT 1 AS ok FROM audit_events WHERE action = 'REQUIREMENT_DOCTYPES_SET'"));
    assert.equal((await op.put(`/api/admin/requirements/${fin.id}/document-types`, { typeCodes: [] })).status, 403);

    const typeId = (await one('SELECT visa_type_id FROM visa_info_versions WHERE version_id = ?', [ids.versionId])).visa_type_id;
    const copy = await admin.post(`/api/admin/visa-types/${typeId}/versions`, { copyFromVersionId: ids.versionId });
    assert.equal(copy.status, 201, JSON.stringify(copy.body));
    const nv = (await admin.get(`/api/admin/versions/${copy.body.id}`)).body;
    assert.deepEqual(nv.requirements.find((x) => x.code === 'FINANCIAL').documentTypes.sort(), [
      'BANK_STATEMENT',
      'EMPLOYMENT_CERT',
      'OTHER',
    ]);
    await admin.put(`/api/admin/requirements/${fin.id}/document-types`, { typeCodes: ['BANK_STATEMENT', 'EMPLOYMENT_CERT'] });
  });
});

describe('Мэдээллээ татах — PDF', () => {
  test('нэг PDF: кирилл текст зөв, паспорт бүтнээр, үнэлгээний түүх, SHA-256, хавсралт нэгтгэсэн, хуудас бүрт “АЛБАН БАРИМТ БИШ”', async () => {
    const { c, user } = await newApplicant(app, 'export');
    await c.put('/api/app/profile', PROFILE);
    await uploadVault(c, 'PHOTO', PNG, 'vault-photo.png');
    const ref = await submitApplication(c, ids);
    // Хүчинтэй PDF хавсралт (нэгтгэсэн эсэхийг тэмдэгтээр шалгана)
    const d2 = await c.post('/api/app/drafts', { versionId: ids.versionId, idempotencyKey: uuid() });
    const ref2 = d2.body.publicId;
    await c.put(`/api/app/drafts/${ref2}/form`, validForm());
    for (const [code, buf, name] of [
      ['FORM_PHOTO', PNG, 'photo2.png'],
      ['PASSPORT_COPY', await markerPdf('ATTACHMENT-MARKER-PASSPORT'), 'passport2.pdf'],
      ['FINANCIAL', await markerPdf('ATTACHMENT-MARKER-BANK'), 'bank2.pdf'],
    ])
      assert.equal(
        (await c.multipart(`/api/app/drafts/${ref2}/documents`, { requirementId: ids.reqIds[code] }, [{ buf, name }])).status,
        201,
      );
    assert.equal((await c.post(`/api/app/drafts/${ref2}/submit`)).status, 201);
    await assign(admin, ref2, (await one('SELECT user_id FROM users WHERE email = ?', [DEMO.operator.email])).user_id);
    await review(op, ref2, 'INCOMPLETE', 'Банкны хуулга бүдэг байна — Өөрчлөлт');

    assert.equal((await c.post('/api/app/privacy/export', { password: 'wrong-pass1' })).status, 400);
    const r = await binary(c.post('/api/app/privacy/export', { password: user.password }));
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/pdf');
    assert.match(r.headers['content-disposition'], /civiz-export-\d{8}\.pdf/);
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');

    const pages = await pdfText(r.body);
    const all = pages.join('\n');
    // Кирилл (Ө, Ү орсон) текст эвдрээгүй — ToUnicode-оор буцааж уншигдана
    for (const s of [
      'ЦАХИМ ВИЗ — хувийн мэдээллийн хуулбар',
      'Профайл — хувийн мэдээлэл',
      'Бүрдлийн үнэлгээний түүх',
      'Өөрчлөлт',
      'Монгол Компани ХХК',
    ]) {
      assert.ok(all.includes(s), `текст олдсонгүй: ${s}`);
    }
    assert.ok(all.includes('E7766554'), 'профайлын паспорт бүтнээр');
    assert.ok(all.includes('E7654321'), 'анкетын паспорт бүтнээр (validForm)');
    assert.ok(all.includes(ref) && all.includes(ref2));
    assert.ok(all.includes('ATTACHMENT-MARKER-PASSPORT') && all.includes('ATTACHMENT-MARKER-BANK'), 'хавсаргасан PDF нэгтгэгдсэн');
    const sha = (await one('SELECT sha256 FROM application_documents WHERE original_name = ?', ['bank2.pdf'])).sha256;
    assert.ok(all.replace(/\s+/g, '').includes(sha), 'SHA-256');
    assert.ok(all.includes('vault-photo.png'), 'баримтын сангийн жагсаалт');
    pages.forEach((p, i) => assert.ok(p.includes('АЛБАН БАРИМТ БИШ'), `хуудас ${i + 1}-д тэмдэглэгээ`));
    assert.ok(!all.includes(DEMO.operator.name), 'ажилтны нэр орохгүй');
    const others = (
      await query('SELECT public_id FROM applications WHERE applicant_id <> (SELECT user_id FROM users WHERE email = ?)', [user.email])
    ).map((x) => x.public_id);
    assert.ok(
      others.every((x) => !all.includes(x)),
      'бусдын мэдүүлэг орохгүй',
    );

    assert.equal((await op.post('/api/app/privacy/export', { password: DEMO.operator.password })).status, 403);
    assert.equal((await admin.post('/api/app/privacy/export', { password: DEMO.admin.password })).status, 403);
    assert.ok(await one("SELECT 1 AS x FROM audit_events WHERE action = 'DATA_EXPORT'"));
  });
});

describe('Визийн төрлийн ноорог (албан эх сурвалжаас) импорт', () => {
  test('нийтлээгүй, шалгасан огноогүй, эх сурвалжтай; давтан импортод давхардахгүй; нийтэд харагдахгүй; огноогүй бол нийтлэхгүй', async () => {
    const { importVisaDrafts } = await import('../scripts/import-visa-drafts.js');
    const first = await importVisaDrafts({ adminEmail: DEMO.admin.email });
    assert.deepEqual(
      first.map((x) => x.code),
      ['C-3-1', 'D-2', 'D-4'],
    );
    assert.ok(first.every((x) => x.action === 'created draft'));
    const again = await importVisaDrafts({ adminEmail: DEMO.admin.email });
    assert.ok(again.every((x) => x.action.startsWith('skipped')));
    const rows = await query(
      `SELECT v.version_id, v.published_at, v.verified_at, v.source_url, t.code, t.is_active FROM visa_info_versions v
         JOIN visa_types t ON t.visa_type_id = v.visa_type_id WHERE v.version_id IN (?)`,
      [first.map((x) => x.versionId)],
    );
    for (const r of rows) {
      assert.equal(r.published_at, null);
      assert.equal(r.verified_at, null);
      assert.match(r.source_url, /^https:\/\/www\.visaforkorea\.mn\//);
    }
    const c31 = rows.find((r) => r.code === 'C-3-1');
    assert.equal(c31.is_active, 0, 'шинэ төрөл идэвхгүй');
    const maps = await one(
      'SELECT COUNT(*) AS n FROM requirement_document_types m JOIN visa_requirements r ON r.requirement_id = m.requirement_id WHERE r.version_id = ?',
      [c31.version_id],
    );
    assert.ok(Number(maps.n) > 0);
    const pub = (await (await import('supertest')).default(app).get('/api/visas')).body.visas.map((v) => v.code);
    assert.ok(!pub.includes('C-3-1') && !pub.includes('D-4'));
    const p = await admin.post(`/api/admin/versions/${c31.version_id}/publish`);
    assert.equal(p.status >= 400 && p.status < 500, true, 'шалгасан огноогүй тул нийтлэхгүй');
    const txt = JSON.stringify(
      await query('SELECT title, instructions FROM visa_requirements WHERE version_id IN (?)', [first.map((x) => x.versionId)]),
    );
    assert.ok(!/хураамж|төлбөр \d|₮|\$\d/i.test(txt.replace(/сургалтын төлбөр/gi, '')), 'хураамж оруулаагүй');
  });
});
