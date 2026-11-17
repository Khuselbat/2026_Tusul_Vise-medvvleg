// Q4 / тайлан 5.2 — лавлахын нэмэлт талбар: хэнд хамаарах, эх/хуулбар, орчуулга, шалгасан ажилтан.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pool, one } from '../src/db.js';
import { setup, login, client, DEMO } from './helpers.js';

let app, ids, admin;
before(async () => {
  ({ app, ids } = await setup());
  admin = await login(app, DEMO.admin);
});
after(async () => {
  await pool.end();
});

describe('Лавлахын нэмэлт талбар (Q4)', () => {
  test('нийтийн мэдээлэлд хэнд хамаарах, эх/хуулбар, орчуулга харагдана', async () => {
    const v = (await client(app).get(`/api/visas/${ids.versionId}`)).body.visa;
    const pass = v.requirements.find((r) => r.code === 'PASSPORT_COPY');
    assert.equal(pass.originalOrCopy, 'BOTH');
    assert.equal(pass.appliesTo, 'Бүх мэдүүлэгч');
    assert.ok(v.requirements.find((r) => r.code === 'FORM_PHOTO').translationNote);
  });

  test('шаардлага нэмэх/засах; буруу утга 400; хуулсан хувилбарт талбарууд дагана', async () => {
    const t = await one("SELECT visa_type_id FROM visa_types WHERE code = 'C-3-9'");
    const copy = await admin.post(`/api/admin/visa-types/${t.visa_type_id}/versions`, { copyFromVersionId: ids.versionId });
    assert.equal(copy.status, 201);
    const vid = copy.body.id;
    const reqs = (await admin.get(`/api/admin/versions/${vid}`)).body.requirements;
    assert.equal(reqs.find((r) => r.code === 'PASSPORT_COPY').originalOrCopy, 'BOTH');
    const base = { code: 'INVITE', title: 'Урилга', isRequired: false, sortOrder: 60 };
    assert.equal((await admin.post(`/api/admin/versions/${vid}/requirements`, { ...base, originalOrCopy: 'SCAN' })).status, 400);
    const ok = await admin.post(`/api/admin/versions/${vid}/requirements`, {
      ...base,
      appliesTo: 'Урилгаар зорчих бол',
      originalOrCopy: 'ORIGINAL',
      translationNote: 'Солонгос хэлээр',
    });
    assert.equal(ok.status, 201);
    const row = await one('SELECT applies_to, original_or_copy, translation_note FROM visa_requirements WHERE requirement_id = ?', [
      ok.body.id,
    ]);
    assert.deepEqual({ ...row }, { applies_to: 'Урилгаар зорчих бол', original_or_copy: 'ORIGINAL', translation_note: 'Солонгос хэлээр' });
  });

  test('шалгасан огноо өөрчлөгдвөл шалгасан ажилтан бүртгэгдэнэ; огноогүй бол хоосон', async () => {
    const t = await one("SELECT visa_type_id FROM visa_types WHERE code = 'D-2'");
    const v = await admin.post(`/api/admin/visa-types/${t.visa_type_id}/versions`, { nameMn: 'D-2 туршилт' });
    const vid = v.body.id;
    assert.equal((await one('SELECT verified_by FROM visa_info_versions WHERE version_id = ?', [vid])).verified_by, null);
    const put = await admin.put(`/api/admin/versions/${vid}`, {
      nameMn: 'D-2 туршилт',
      sourceUrl: 'https://overseas.mofa.go.kr/mn-mn/wpge/m_276/contents.do',
      verifiedAt: '2026-11-01',
    });
    assert.equal(put.status, 200);
    assert.equal((await one('SELECT verified_by FROM visa_info_versions WHERE version_id = ?', [vid])).verified_by, ids.adminId);
    const shown = (await admin.get(`/api/admin/versions/${vid}`)).body.version;
    assert.equal(shown.verifiedBy, DEMO.admin.name);
    await admin.put(`/api/admin/versions/${vid}`, { nameMn: 'D-2 туршилт', verifiedAt: '' });
    assert.equal((await one('SELECT verified_by FROM visa_info_versions WHERE version_id = ?', [vid])).verified_by, null);
  });
});
