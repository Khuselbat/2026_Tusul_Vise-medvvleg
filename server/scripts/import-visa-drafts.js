// БНСУ-ын визийн төрлүүдийн НИЙТЛЭЭГҮЙ ноорог хувилбарыг database/reference/kr-visa-drafts.json-оос импортлоно.
// Ноорог нь албан эх сурвалжийн (KVAC) холбоостой, шалгасан огноогүй (verified_at NULL) — админ эх сурвалжтай нэг бүрчлэн
// тулгаж, огноогоо тавиад өөрөө нийтэлнэ (BR-04). Хураамж, хугацаа оруулаагүй. Дахин ажиллуулахад давхардахгүй
// (ижил эх сурвалжтай нийтлээгүй ноорог байвал алгасна). Шинэ визийн төрлийг идэвхгүй (is_active = 0) үүсгэнэ.
//   cd server && node scripts/import-visa-drafts.js --admin admin@example.mn [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { pool, tx, one } from '../src/db.js';
import { audit } from '../src/lib/audit.js';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'reference', 'kr-visa-drafts.json');

/** @returns {Promise<Array<{code, action, versionId?}>>} */
export async function importVisaDrafts({ adminEmail, dryRun = false, log = () => {} } = {}) {
  const ref = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const admin = adminEmail
    ? await one("SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.email = ? AND r.code = 'ADMIN'", [adminEmail])
    : await one(
        "SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code = 'ADMIN' AND u.is_active = 1 ORDER BY u.user_id LIMIT 1",
      );
  if (!admin) throw new Error(adminEmail ? `Админ олдсонгүй: ${adminEmail}` : 'Идэвхтэй админ алга — эхлээд create-admin.');
  const country = await one('SELECT country_id FROM countries WHERE iso_code = ?', [ref.country]);
  if (!country) throw new Error(`Улс олдсонгүй: ${ref.country} — эхлээд админаар улсаа нэмнэ.`);
  const types = new Set((await pool.query('SELECT code FROM document_types'))[0].map((x) => x.code));

  const out = [];
  for (const d of ref.drafts) {
    for (const r of d.requirements)
      for (const t of r.docTypes || []) if (!types.has(t)) throw new Error(`${d.code}/${r.code}: баримтын төрөл ${t} алга`);
    const type = await one('SELECT visa_type_id FROM visa_types WHERE country_id = ? AND code = ?', [country.country_id, d.code]);
    if (type) {
      const dup = await one(
        'SELECT version_id FROM visa_info_versions WHERE visa_type_id = ? AND source_url = ? AND published_at IS NULL',
        [type.visa_type_id, d.sourceUrl],
      );
      if (dup) {
        out.push({ code: d.code, action: 'skipped (ноорог аль хэдийн бий)', versionId: dup.version_id });
        log(`= ${d.code}: ноорог аль хэдийн бий (v#${dup.version_id})`);
        continue;
      }
    }
    if (dryRun) {
      out.push({ code: d.code, action: type ? 'would add version' : 'would create type + version' });
      log(`~ ${d.code}: ${d.requirements.length} шаардлага (dry-run)`);
      continue;
    }
    const versionId = await tx(async (q) => {
      const typeId = type
        ? type.visa_type_id
        : (await q('INSERT INTO visa_types (country_id, code, is_active) VALUES (?, ?, 0)', [country.country_id, d.code])).insertId;
      const next = Number(
        (await q('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM visa_info_versions WHERE visa_type_id = ? FOR UPDATE', [typeId]))[0].n,
      );
      const description = [
        d.description,
        d.otherSources?.length ? `Нэмэлт эх сурвалж: ${d.otherSources.join(', ')}` : '',
        `KVAC-ын хуудаснаас ${ref.readAt}-нд уншсан. Шалгасан огноог админ эх сурвалжтай тулгасны дараа тавина.`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const v = await q(
        'INSERT INTO visa_info_versions (visa_type_id, version_no, name_mn, description, source_url, verified_at, created_by) VALUES (?,?,?,?,?, NULL, ?)',
        [typeId, next, d.name, description, d.sourceUrl, admin.user_id],
      );
      let i = 0;
      for (const r of d.requirements) {
        i += 1;
        const req = await q(
          `INSERT INTO visa_requirements (version_id, code, title, instructions, applies_to, original_or_copy, translation_note, is_required, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            v.insertId,
            r.code,
            r.title,
            r.instructions,
            r.appliesTo || null,
            r.originalOrCopy || null,
            r.translationNote || null,
            r.required ? 1 : 0,
            i * 10,
          ],
        );
        for (const t of r.docTypes || [])
          await q('INSERT INTO requirement_document_types (requirement_id, type_code) VALUES (?, ?)', [req.insertId, t]);
      }
      await audit(
        { id: 'import-visa-drafts', user: null },
        { action: 'VERSION_CREATE', entityType: 'visa_info_version', entityKey: v.insertId, actorId: admin.user_id },
        q,
      );
      return v.insertId;
    });
    out.push({ code: d.code, action: 'created draft', versionId });
    log(`+ ${d.code}: нийтлээгүй ноорог v#${versionId} (${d.requirements.length} шаардлага) — ${d.sourceUrl}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { admin: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
  try {
    await importVisaDrafts({ adminEmail: values.admin, dryRun: values['dry-run'], log: (m) => console.log(m) });
    console.log('Дууслаа. Админ → “Визийн төрөл” → ноорог бүрийг эх сурвалжтай тулгаж, шалгасан огноог тавиад нийтэлнэ.');
  } catch (e) {
    console.error(`Импорт амжилтгүй: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
