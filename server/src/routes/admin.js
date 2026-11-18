import { Router } from 'express';
import { hashPassword } from '../lib/password.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, one, tx } from '../db.js';
import { wrap, parse, notFound, conflict, badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { STATUS_LABEL } from '../lib/visa.js';
import { requireRole, revokeSessions } from '../middleware/auth.js';
import { notify, kickMailer } from '../lib/notify.js';
import { passwordSchema } from './auth.js';

/**
 * Админ: улс, визийн төрөл, мэдээллийн хувилбар, шаардлага, хэрэглэгч, хуваарилалт, үйлдлийн бүртгэл.
 * Админы эрх нь хувийн анкет, хавсралтыг унших эрх БИШ — энд анкет/файлын endpoint байхгүй.
 */
const r = Router();
r.use(requireRole('ADMIN'));

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url('URL буруу байна.')
  .refine((u) => u.startsWith('https://'), 'Зөвхөн HTTPS холбоос зөвшөөрнө.');
const optionalHttpsUrl = z.union([httpsUrl, z.literal('').transform(() => null), z.null()]).optional();
const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

// ───────────── Зураг 54 Самбар ─────────────
r.get(
  '/dashboard',
  wrap(async (_req, res) => {
    const [countries, types, versions, apps, users, unassigned] = await Promise.all([
      query('SELECT service_status, COUNT(*) AS n FROM countries GROUP BY service_status'),
      one('SELECT COUNT(*) AS n, SUM(is_active) AS active FROM visa_types'),
      one('SELECT SUM(published_at IS NOT NULL) AS published, SUM(published_at IS NULL) AS drafts FROM visa_info_versions'),
      query("SELECT status, COUNT(*) AS n FROM applications WHERE status <> 'DRAFT' GROUP BY status"),
      query('SELECT r.code, u.is_active, COUNT(*) AS n FROM users u JOIN roles r ON r.role_id = u.role_id GROUP BY r.code, u.is_active'),
      one("SELECT COUNT(*) AS n FROM applications WHERE status <> 'DRAFT' AND assigned_operator_id IS NULL"),
    ]);
    const usersBy = {};
    for (const u of users) usersBy[u.code] = (usersBy[u.code] || 0) + (u.is_active ? Number(u.n) : 0);
    res.json({
      countries: Object.fromEntries(countries.map((c) => [c.service_status, Number(c.n)])),
      visaTypes: { total: Number(types.n || 0), active: Number(types.active || 0) },
      versions: { published: Number(versions.published || 0), drafts: Number(versions.drafts || 0) },
      applications: Object.fromEntries(apps.map((a) => [a.status, Number(a.n)])),
      unassigned: Number(unassigned.n),
      activeUsers: usersBy,
    });
  }),
);

// ───────────── Зураг 55 Улс ─────────────
const countrySchema = z.object({
  isoCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 код (2 үсэг).'),
  nameMn: z.string().trim().min(2, 'Монгол нэрийг оруулна уу.').max(100),
  serviceStatus: z.enum(['ACTIVE', 'COMING_SOON', 'DISABLED']),
  officialResultUrl: optionalHttpsUrl,
});

r.get(
  '/countries',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM visa_types t WHERE t.country_id = c.country_id) AS type_count FROM countries c ORDER BY c.name_mn`,
    );
    res.json({
      countries: rows.map((c) => ({
        id: c.country_id,
        isoCode: c.iso_code,
        nameMn: c.name_mn,
        serviceStatus: c.service_status,
        officialResultUrl: c.official_result_url,
        typeCount: Number(c.type_count),
      })),
    });
  }),
);

async function saveCountry(req, res, id) {
  const d = parse(countrySchema, req.body);
  try {
    const key = await tx(async (q) => {
      let cid = id;
      if (id) {
        const u = await q('UPDATE countries SET iso_code=?, name_mn=?, service_status=?, official_result_url=? WHERE country_id=?', [
          d.isoCode,
          d.nameMn,
          d.serviceStatus,
          d.officialResultUrl ?? null,
          id,
        ]);
        if (!u.affectedRows) throw notFound('Улс олдсонгүй.');
      } else {
        cid = (
          await q('INSERT INTO countries (iso_code, name_mn, service_status, official_result_url) VALUES (?,?,?,?)', [
            d.isoCode,
            d.nameMn,
            d.serviceStatus,
            d.officialResultUrl ?? null,
          ])
        ).insertId;
      }
      await audit(req, { action: id ? 'COUNTRY_UPDATE' : 'COUNTRY_CREATE', entityType: 'country', entityKey: d.isoCode }, q);
      return cid;
    });
    res.status(id ? 200 : 201).json({ id: key });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('ISO код давхардаж байна.', { fields: { isoCode: 'ISO код давхардаж байна.' } });
    throw e;
  }
}
r.post(
  '/countries',
  wrap((req, res) => saveCountry(req, res, null)),
);
r.put(
  '/countries/:id',
  wrap((req, res) => saveCountry(req, res, idParam(req.params.id))),
);
r.delete(
  '/countries/:id',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const c = await one(
      'SELECT iso_code, (SELECT COUNT(*) FROM visa_types t WHERE t.country_id = c.country_id) AS n FROM countries c WHERE country_id = ?',
      [id],
    );
    if (!c) throw notFound('Улс олдсонгүй.');
    if (Number(c.n) > 0) throw conflict('Визийн төрөлтэй холбоотой улсыг устгахгүй. Төлөвийг нь өөрчилнө үү.');
    await tx(async (q) => {
      await q('DELETE FROM countries WHERE country_id = ?', [id]);
      await audit(req, { action: 'COUNTRY_DELETE', entityType: 'country', entityKey: c.iso_code }, q);
    });
    res.json({ ok: true });
  }),
);

// ───────────── Зураг 56 Визийн төрөл ─────────────
r.get(
  '/visa-types',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT t.*, c.iso_code, c.name_mn AS country_name,
            (SELECT COUNT(*) FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id) AS version_count,
            (SELECT MAX(v.version_no) FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id AND v.published_at IS NOT NULL) AS published_no,
            (SELECT v.name_mn FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id ORDER BY v.version_no DESC LIMIT 1) AS latest_name
       FROM visa_types t JOIN countries c ON c.country_id = t.country_id ORDER BY c.name_mn, t.code`,
    );
    res.json({
      visaTypes: rows.map((t) => ({
        id: t.visa_type_id,
        code: t.code,
        isActive: !!t.is_active,
        country: { id: t.country_id, iso: t.iso_code, name: t.country_name },
        versionCount: Number(t.version_count),
        publishedVersionNo: t.published_no,
        latestName: t.latest_name,
      })),
    });
  }),
);

const typeSchema = z.object({
  countryId: z.coerce.number().int().positive('Улс сонгоно уу.'),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Код оруулна уу.')
    .max(30)
    .regex(/^[A-Z0-9-]+$/, 'Код: латин том үсэг, тоо, зураас.'),
  isActive: z.boolean(),
});
async function saveType(req, res, id) {
  const d = parse(typeSchema, req.body);
  try {
    const key = await tx(async (q) => {
      let tid = id;
      if (id) {
        const u = await q('UPDATE visa_types SET country_id=?, code=?, is_active=? WHERE visa_type_id=?', [
          d.countryId,
          d.code,
          d.isActive,
          id,
        ]);
        if (!u.affectedRows) throw notFound('Визийн төрөл олдсонгүй.');
      } else {
        tid = (await q('INSERT INTO visa_types (country_id, code, is_active) VALUES (?,?,?)', [d.countryId, d.code, d.isActive])).insertId;
      }
      await audit(req, { action: id ? 'VISA_TYPE_UPDATE' : 'VISA_TYPE_CREATE', entityType: 'visa_type', entityKey: tid }, q);
      return tid;
    });
    res.status(id ? 200 : 201).json({ id: key });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      throw conflict('Энэ улсад ижил код бүртгэлтэй байна.', { fields: { code: 'Улс дотор код давхардаж байна.' } });
    if (e.code === 'ER_NO_REFERENCED_ROW_2') throw badRequest('Улс олдсонгүй.');
    throw e;
  }
}
r.post(
  '/visa-types',
  wrap((req, res) => saveType(req, res, null)),
);
r.put(
  '/visa-types/:id',
  wrap((req, res) => saveType(req, res, idParam(req.params.id))),
);

// ───────────── Зураг 57 Мэдээллийн хувилбар ─────────────
function serializeVersion(v) {
  return {
    id: v.version_id,
    visaTypeId: v.visa_type_id,
    versionNo: v.version_no,
    nameMn: v.name_mn,
    description: v.description,
    sourceUrl: v.source_url,
    verifiedAt: v.verified_at,
    verifiedBy: v.verifier_name ?? null,
    createdAt: v.created_at,
    publishedAt: v.published_at,
    createdBy: v.creator_name,
    requirementCount: v.req_count !== undefined ? Number(v.req_count) : undefined,
    applicationCount: v.app_count !== undefined ? Number(v.app_count) : undefined,
  };
}

r.get(
  '/visa-types/:id/versions',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const t = await one(
      'SELECT t.*, c.name_mn AS country_name, c.iso_code FROM visa_types t JOIN countries c ON c.country_id = t.country_id WHERE visa_type_id = ?',
      [id],
    );
    if (!t) throw notFound('Визийн төрөл олдсонгүй.');
    const rows = await query(
      `SELECT v.*, u.display_name AS creator_name,
            (SELECT COUNT(*) FROM visa_requirements q WHERE q.version_id = v.version_id) AS req_count,
            (SELECT COUNT(*) FROM applications a WHERE a.version_id = v.version_id) AS app_count
       FROM visa_info_versions v JOIN users u ON u.user_id = v.created_by WHERE v.visa_type_id = ? ORDER BY v.version_no DESC`,
      [id],
    );
    res.json({
      visaType: { id: t.visa_type_id, code: t.code, isActive: !!t.is_active, country: { name: t.country_name, iso: t.iso_code } },
      versions: rows.map(serializeVersion),
    });
  }),
);

const versionSchema = z.object({
  nameMn: z.string().trim().min(2, 'Нэр оруулна уу.').max(180),
  description: z.string().trim().max(20000).optional().default(''),
  sourceUrl: optionalHttpsUrl,
  verifiedAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу.'), z.literal('').transform(() => null), z.null()]).optional(),
});

// Шинэ хувилбар (хоосон эсвэл нийтэлсэн хувилбараас хуулж). version_no-г сервер тооцоолно.
r.post(
  '/visa-types/:id/versions',
  wrap(async (req, res) => {
    const typeId = idParam(req.params.id);
    const copyFrom = req.body?.copyFromVersionId ? Number(req.body.copyFromVersionId) : null;
    const d = copyFrom ? null : parse(versionSchema, req.body);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const out = await tx(async (q) => {
          const t = (await q('SELECT visa_type_id FROM visa_types WHERE visa_type_id = ? FOR UPDATE', [typeId]))[0];
          if (!t) throw notFound('Визийн төрөл олдсонгүй.');
          const next = Number(
            (await q('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM visa_info_versions WHERE visa_type_id = ?', [typeId]))[0].n,
          );
          let src = d;
          let srcReqs = [];
          if (copyFrom) {
            const sv = (await q('SELECT * FROM visa_info_versions WHERE version_id = ? AND visa_type_id = ?', [copyFrom, typeId]))[0];
            if (!sv) throw notFound('Хуулах хувилбар олдсонгүй.');
            src = {
              nameMn: sv.name_mn,
              description: sv.description,
              sourceUrl: sv.source_url,
              verifiedAt: sv.verified_at,
              verifiedBy: sv.verified_by,
            };
            srcReqs = await q('SELECT * FROM visa_requirements WHERE version_id = ?', [copyFrom]);
          }
          const ins = await q(
            `INSERT INTO visa_info_versions (visa_type_id, version_no, name_mn, description, source_url, verified_at, verified_by, created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
            [
              typeId,
              next,
              src.nameMn,
              src.description || null,
              src.sourceUrl ?? null,
              src.verifiedAt ?? null,
              src.verifiedAt ? (src.verifiedBy ?? req.user.id) : null,
              req.user.id,
            ],
          );
          for (const sr of srcReqs) {
            const insReq = await q(
              `INSERT INTO visa_requirements (version_id, code, title, instructions, applies_to, original_or_copy, translation_note, is_required, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?)`,
              [
                ins.insertId,
                sr.code,
                sr.title,
                sr.instructions,
                sr.applies_to,
                sr.original_or_copy,
                sr.translation_note,
                sr.is_required,
                sr.sort_order,
              ],
            );
            // Баримтын төрлийн холболтыг хамт хуулна (migration 013)
            await q(
              'INSERT INTO requirement_document_types (requirement_id, type_code) SELECT ?, type_code FROM requirement_document_types WHERE requirement_id = ?',
              [insReq.insertId, sr.requirement_id],
            );
          }
          await audit(req, { action: 'VERSION_CREATE', entityType: 'visa_info_version', entityKey: ins.insertId }, q);
          return { id: ins.insertId, versionNo: next };
        });
        return res.status(201).json(out);
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY' || attempt === 2) throw e;
      }
    }
  }),
);

async function loadVersion(id) {
  const v = await one(
    `SELECT v.*, u.display_name AS creator_name, uv.display_name AS verifier_name, t.code AS type_code, c.name_mn AS country_name
       FROM visa_info_versions v JOIN users u ON u.user_id = v.created_by
       LEFT JOIN users uv ON uv.user_id = v.verified_by
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id JOIN countries c ON c.country_id = t.country_id
      WHERE v.version_id = ?`,
    [id],
  );
  if (!v) throw notFound('Хувилбар олдсонгүй.');
  return v;
}

r.get(
  '/versions/:id',
  wrap(async (req, res) => {
    const v = await loadVersion(idParam(req.params.id));
    const reqs = await query('SELECT * FROM visa_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id', [v.version_id]);
    const maps = await query(
      'SELECT m.requirement_id, m.type_code FROM requirement_document_types m JOIN visa_requirements r ON r.requirement_id = m.requirement_id WHERE r.version_id = ?',
      [v.version_id],
    );
    const typesOf = (id) => maps.filter((m) => m.requirement_id === id).map((m) => m.type_code);
    res.json({
      documentTypes: (await query('SELECT code, name_mn FROM document_types WHERE is_active = 1 ORDER BY sort_order')).map((t) => ({
        code: t.code,
        name: t.name_mn,
      })),
      version: { ...serializeVersion(v), typeCode: v.type_code, countryName: v.country_name },
      requirements: reqs.map((q) => ({
        id: q.requirement_id,
        code: q.code,
        title: q.title,
        instructions: q.instructions,
        appliesTo: q.applies_to,
        originalOrCopy: q.original_or_copy,
        translationNote: q.translation_note,
        isRequired: !!q.is_required,
        sortOrder: q.sort_order,
        documentTypes: typesOf(q.requirement_id),
      })),
    });
  }),
);

/** Нийтэлсэн хувилбарыг шууд засахгүй — хуулж шинэ хувилбар үүсгэнэ. */
async function lockDraftVersion(q, id) {
  const v = (await q('SELECT version_id, published_at FROM visa_info_versions WHERE version_id = ? FOR UPDATE', [id]))[0];
  if (!v) throw notFound('Хувилбар олдсонгүй.');
  if (v.published_at) throw conflict('Нийтэлсэн хувилбарыг засахгүй. Хуулж шинэ хувилбар үүсгэнэ үү.');
  return v;
}

r.put(
  '/versions/:id',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const d = parse(versionSchema, req.body);
    await tx(async (q) => {
      await lockDraftVersion(q, id);
      // Шалгасан ажилтан (тайлан 5.2): огноо өөрчлөгдвөл хадгалсан админ. SET зүүнээс баруун тийш үнэлэгддэг тул verified_by эхэнд.
      const vAt = d.verifiedAt ?? null;
      await q(
        `UPDATE visa_info_versions
            SET verified_by = CASE WHEN ? IS NULL THEN NULL WHEN verified_at <=> ? AND verified_by IS NOT NULL THEN verified_by ELSE ? END,
                name_mn=?, description=?, source_url=?, verified_at=?
          WHERE version_id=?`,
        [vAt, vAt, req.user.id, d.nameMn, d.description || null, d.sourceUrl ?? null, vAt, id],
      );
      await audit(req, { action: 'VERSION_UPDATE', entityType: 'visa_info_version', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

// BR-04 / FR-11: эх сурвалж, шалгасан огноо, шаардлагагүй бол нийтлэхгүй
r.post(
  '/versions/:id/publish',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await tx(async (q) => {
      await lockDraftVersion(q, id);
      const v = (await q('SELECT * FROM visa_info_versions WHERE version_id = ?', [id]))[0];
      const n = Number((await q('SELECT COUNT(*) AS n FROM visa_requirements WHERE version_id = ?', [id]))[0].n);
      const fields = {};
      if (!v.source_url) fields.sourceUrl = 'Эх сурвалжийн холбоос заавал.';
      if (!v.verified_at) fields.verifiedAt = 'Шалгасан огноо заавал.';
      if (!v.name_mn) fields.nameMn = 'Нэр заавал.';
      if (n === 0) fields.requirements = 'Дор хаяж нэг материалын шаардлага нэмнэ үү.';
      if (Object.keys(fields).length) throw badRequest('Нийтлэхэд шаардлагатай мэдээлэл дутуу байна.', { fields });
      await q('UPDATE visa_info_versions SET published_at = CURRENT_TIMESTAMP(6) WHERE version_id = ?', [id]);
      await audit(req, { action: 'VERSION_PUBLISH', entityType: 'visa_info_version', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

r.delete(
  '/versions/:id',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await tx(async (q) => {
      await lockDraftVersion(q, id);
      const n = Number((await q('SELECT COUNT(*) AS n FROM applications WHERE version_id = ?', [id]))[0].n);
      if (n) throw conflict('Мэдүүлэгтэй холбоотой хувилбарыг устгахгүй.');
      await q('DELETE FROM visa_requirements WHERE version_id = ?', [id]);
      await q('DELETE FROM visa_info_versions WHERE version_id = ?', [id]);
      await audit(req, { action: 'VERSION_DELETE', entityType: 'visa_info_version', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

// ───────────── Зураг 58 Материалын шаардлага ─────────────
const reqSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Код оруулна уу.')
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'Код: латин том үсэг, тоо, _ -'),
  title: z.string().trim().min(2, 'Нэр оруулна уу.').max(200),
  instructions: z.string().trim().max(5000).optional().default(''),
  appliesTo: z.string().trim().max(300).optional().default(''),
  originalOrCopy: z
    .union([z.enum(['ORIGINAL', 'COPY', 'BOTH']), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
  translationNote: z.string().trim().max(500).optional().default(''),
  isRequired: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(65535).default(0),
});

r.post(
  '/versions/:id/requirements',
  wrap(async (req, res) => {
    const vid = idParam(req.params.id);
    const d = parse(reqSchema, req.body);
    try {
      const id = await tx(async (q) => {
        await lockDraftVersion(q, vid);
        const ins = await q(
          `INSERT INTO visa_requirements (version_id, code, title, instructions, applies_to, original_or_copy, translation_note, is_required, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            vid,
            d.code,
            d.title,
            d.instructions || null,
            d.appliesTo || null,
            d.originalOrCopy,
            d.translationNote || null,
            d.isRequired,
            d.sortOrder,
          ],
        );
        await audit(req, { action: 'REQUIREMENT_CREATE', entityType: 'visa_requirement', entityKey: ins.insertId }, q);
        return ins.insertId;
      });
      res.status(201).json({ id });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw conflict('Нэг хувилбарт код давхардаж байна.', { fields: { code: 'Код давхардаж байна.' } });
      throw e;
    }
  }),
);

r.put(
  '/requirements/:id',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const d = parse(reqSchema, req.body);
    try {
      await tx(async (q) => {
        const row = (await q('SELECT version_id FROM visa_requirements WHERE requirement_id = ?', [id]))[0];
        if (!row) throw notFound('Шаардлага олдсонгүй.');
        await lockDraftVersion(q, row.version_id);
        await q(
          `UPDATE visa_requirements SET code=?, title=?, instructions=?, applies_to=?, original_or_copy=?, translation_note=?, is_required=?, sort_order=?
            WHERE requirement_id=?`,
          [
            d.code,
            d.title,
            d.instructions || null,
            d.appliesTo || null,
            d.originalOrCopy,
            d.translationNote || null,
            d.isRequired,
            d.sortOrder,
            id,
          ],
        );
        await audit(req, { action: 'REQUIREMENT_UPDATE', entityType: 'visa_requirement', entityKey: id }, q);
      });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw conflict('Нэг хувилбарт код давхардаж байна.', { fields: { code: 'Код давхардаж байна.' } });
      throw e;
    }
  }),
);

r.delete(
  '/requirements/:id',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    await tx(async (q) => {
      const row = (await q('SELECT version_id FROM visa_requirements WHERE requirement_id = ?', [id]))[0];
      if (!row) throw notFound('Шаардлага олдсонгүй.');
      await lockDraftVersion(q, row.version_id);
      await q('DELETE FROM visa_requirements WHERE requirement_id = ?', [id]);
      await audit(req, { action: 'REQUIREMENT_DELETE', entityType: 'visa_requirement', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

/**
 * Шаардлагад тохирох баримтын төрлүүд (профайлаас автоматаар хавсаргахад). Нийтэлсэн хувилбарт ч зөвшөөрнө (D-62):
 * нийтэд харагдах агуулга (нэр, заавар, эх сурвалж) өөрчлөгдөхгүй, зөвхөн автомат бөглөлтийн санал. Audit-тай.
 */
r.put(
  '/requirements/:id/document-types',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const { typeCodes } = parse(z.object({ typeCodes: z.array(z.string().trim().min(1).max(40)).max(10) }), req.body);
    const codes = [...new Set(typeCodes)];
    await tx(async (q) => {
      if (!(await q('SELECT requirement_id FROM visa_requirements WHERE requirement_id = ? FOR UPDATE', [id]))[0])
        throw notFound('Шаардлага олдсонгүй.');
      if (codes.length) {
        const known = await q('SELECT code FROM document_types WHERE code IN (?) AND is_active = 1', [codes]);
        if (known.length !== codes.length) throw badRequest('Баримтын төрөл буруу байна.');
      }
      await q('DELETE FROM requirement_document_types WHERE requirement_id = ?', [id]);
      for (const c of codes) await q('INSERT INTO requirement_document_types (requirement_id, type_code) VALUES (?, ?)', [id, c]);
      await audit(req, { action: 'REQUIREMENT_DOCTYPES_SET', entityType: 'visa_requirement', entityKey: id }, q);
    });
    res.json({ requirementId: id, documentTypes: codes });
  }),
);

// ───────────── Зураг 59 Хэрэглэгч ба эрх ─────────────
r.get(
  '/users',
  wrap(async (req, res) => {
    const role = ['APPLICANT', 'OPERATOR', 'ADMIN'].includes(req.query.role) ? req.query.role : null;
    const q = req.query.q ? `%${String(req.query.q).slice(0, 80)}%` : null;
    const rows = await query(
      `SELECT u.user_id, u.public_id, u.email, u.display_name, u.is_active, u.created_at, u.email_verified_at, u.mfa_enabled_at, r.code AS role,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_operator_id = u.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS open_assignments
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE (? IS NULL OR r.code = ?) AND (? IS NULL OR u.email LIKE ? OR u.display_name LIKE ?)
      ORDER BY r.code, u.display_name LIMIT 500`,
      [role, role, q, q, q],
    );
    res.json({
      users: rows.map((u) => ({
        id: u.user_id,
        email: u.email,
        name: u.display_name,
        role: u.role,
        isActive: !!u.is_active,
        emailVerified: !!u.email_verified_at,
        mfaEnabled: !!u.mfa_enabled_at,
        createdAt: u.created_at,
        openAssignments: Number(u.open_assignments),
      })),
    });
  }),
);

r.post(
  '/users',
  wrap(async (req, res) => {
    const d = parse(
      z.object({
        name: z.string().trim().min(2, 'Нэр оруулна уу.').max(150),
        email: z.string().trim().toLowerCase().email('Имэйлийн хэлбэр буруу байна.').max(254),
        password: passwordSchema,
        role: z.enum(['OPERATOR', 'ADMIN'], { error: 'OPERATOR эсвэл ADMIN эрх сонгоно уу.' }),
      }),
      req.body,
    );
    const hash = await hashPassword(d.password);
    try {
      const id = await tx(async (q) => {
        const ins = await q(
          `INSERT INTO users (public_id, role_id, email, password_hash, display_name, email_verified_at)
           VALUES (?, (SELECT role_id FROM roles WHERE code = ?), ?, ?, ?, CURRENT_TIMESTAMP(6))`,
          [crypto.randomUUID(), d.role, d.email, hash, d.name],
        );
        await audit(req, { action: 'STAFF_CREATE', entityType: 'user', entityKey: ins.insertId }, q);
        return ins.insertId;
      });
      res.status(201).json({ id });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw conflict('Энэ имэйлээр бүртгэл үүссэн байна.', { fields: { email: 'Имэйл давхардаж байна.' } });
      throw e;
    }
  }),
);

r.put(
  '/users/:id/status',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    await tx(async (q) => {
      const u = (
        await q(
          'SELECT u.user_id, u.is_active, r.code AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? FOR UPDATE',
          [id],
        )
      )[0];
      if (!u) throw notFound('Хэрэглэгч олдсонгүй.');
      if (!isActive && u.role === 'ADMIN') {
        const n = Number(
          (
            await q(
              "SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code='ADMIN' AND u.is_active = 1 AND u.user_id <> ? FOR UPDATE",
              [id],
            )
          )[0].n,
        );
        if (n === 0) throw conflict('Сүүлийн идэвхтэй админыг идэвхгүй болгохгүй.');
      }
      if (!isActive && u.role === 'OPERATOR') {
        const n = Number(
          (
            await q(
              "SELECT COUNT(*) AS n FROM applications WHERE assigned_operator_id = ? AND status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')",
              [id],
            )
          )[0].n,
        );
        if (n > 0) throw conflict(`Энэ операторт ${n} нээлттэй мэдүүлэг хуваарилагдсан. Эхлээд дахин хуваарилна уу.`);
      }
      await q('UPDATE users SET is_active = ? WHERE user_id = ?', [isActive, id]);
      if (!isActive) await revokeSessions(q, id); // идэвхгүй болгоход бүх сесс даруй хүчингүй
      await audit(req, { action: isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', entityType: 'user', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

// Үе 2: ажилтны 2FA-г дахин тохируулах (утсаа гээсэн г.м.) — дараагийн нэвтрэлтэд QR-аар дахин бүртгүүлнэ
r.post(
  '/users/:id/mfa-reset',
  wrap(async (req, res) => {
    const id = idParam(req.params.id);
    if (id === req.user.id) throw badRequest('Өөрийн 2FA-г өөр админаар дахин тохируулуулна уу.');
    await tx(async (q) => {
      const u = (
        await q('SELECT u.user_id, r.code AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? FOR UPDATE', [id])
      )[0];
      if (!u) throw notFound('Хэрэглэгч олдсонгүй.');
      if (u.role === 'APPLICANT') throw badRequest('2FA зөвхөн ажилтанд хамаарна.');
      await q('UPDATE users SET mfa_secret_enc = NULL, mfa_key_id = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL WHERE user_id = ?', [
        id,
      ]);
      await q('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [id]);
      await revokeSessions(q, id);
      await audit(req, { action: 'MFA_RESET', entityType: 'user', entityKey: id }, q);
    });
    res.json({ ok: true });
  }),
);

// ───────────── Зураг 60 Хуваарилалт (зөвхөн metadata) ─────────────
r.get(
  '/assignments',
  wrap(async (req, res) => {
    const filter = ['unassigned', 'assigned', 'all'].includes(req.query.filter) ? req.query.filter : 'unassigned';
    const where = ["a.status <> 'DRAFT'"];
    if (filter === 'unassigned') where.push('a.assigned_operator_id IS NULL');
    if (filter === 'assigned') where.push('a.assigned_operator_id IS NOT NULL');
    const params = [];
    const search = String(req.query.q || '')
      .trim()
      .slice(0, 40);
    if (search) {
      where.push('a.public_id LIKE ?');
      params.push(`%${search}%`);
    }
    const rows = await query(
      `SELECT a.public_id, a.status, a.submitted_at, a.assigned_operator_id, t.code, c.name_mn AS country_name, uo.display_name AS operator_name
       FROM applications a JOIN visa_info_versions v ON v.version_id = a.version_id JOIN visa_types t ON t.visa_type_id = v.visa_type_id
       JOIN countries c ON c.country_id = t.country_id LEFT JOIN users uo ON uo.user_id = a.assigned_operator_id
      WHERE ${where.join(' AND ')} ORDER BY a.submitted_at ASC LIMIT 500`,
      params,
    );
    const ops = await query(
      `SELECT u.user_id, u.display_name,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_operator_id = u.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS load_n
       FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code = 'OPERATOR' AND u.is_active = 1 ORDER BY u.display_name`,
    );
    res.json({
      items: rows.map((a) => ({
        publicId: a.public_id,
        status: a.status,
        statusLabel: STATUS_LABEL[a.status],
        submittedAt: a.submitted_at,
        visaCode: a.code,
        country: a.country_name,
        operatorId: a.assigned_operator_id,
        operatorName: a.operator_name,
      })),
      operators: ops.map((o) => ({ id: o.user_id, name: o.display_name, openCount: Number(o.load_n) })),
    });
  }),
);

/** Нэг мэдүүлгийг хуваарилах/цуцлах (транзакц дотор). Зэрэгцээ өөрчлөлт → 409 (expectedOperatorId). */
async function assignOne(q, req, publicId, operatorId, expectedOperatorId) {
  const a = (
    await q(
      "SELECT application_id, public_id, assigned_operator_id, status FROM applications WHERE public_id = ? AND status <> 'DRAFT' FOR UPDATE",
      [publicId],
    )
  )[0];
  if (!a) throw notFound(`Мэдүүлэг олдсонгүй: ${publicId}`);
  if ((a.assigned_operator_id ?? null) !== expectedOperatorId) {
    throw conflict('Хуваарилалт өөр хэрэглэгчээр өөрчлөгдсөн байна. Дахин уншина уу.', { conflicts: [a.public_id] });
  }
  let status = a.status;
  const hasReview = Number((await q('SELECT COUNT(*) AS n FROM reviews WHERE application_id = ?', [a.application_id]))[0].n) > 0;
  if (!hasReview) status = operatorId ? 'IN_REVIEW' : 'SUBMITTED';
  await q('UPDATE applications SET assigned_operator_id = ?, status = ? WHERE application_id = ?', [operatorId, status, a.application_id]);
  await audit(
    req,
    {
      action: operatorId ? (a.assigned_operator_id ? 'APP_REASSIGN' : 'APP_ASSIGN') : 'APP_UNASSIGN',
      entityType: 'application',
      entityKey: a.public_id,
      applicationId: a.application_id,
    },
    q,
  );
  if (operatorId) await notify(q, { userId: operatorId, kind: 'APP_ASSIGNED', applicationId: a.application_id, ref: a.public_id });
}

async function requireActiveOperator(q, operatorId) {
  if (!operatorId) return;
  const op = (
    await q(
      "SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? AND r.code = 'OPERATOR' AND u.is_active = 1",
      [operatorId],
    )
  )[0];
  if (!op) throw badRequest('Идэвхтэй оператор сонгоно уу.');
}

r.put(
  '/assignments/:publicId',
  wrap(async (req, res) => {
    const d = parse(
      z.object({
        operatorId: z.number().int().positive().nullable(),
        expectedOperatorId: z.number().int().positive().nullable(),
      }),
      req.body,
    );
    await tx(async (q) => {
      await requireActiveOperator(q, d.operatorId);
      await assignOne(q, req, req.params.publicId, d.operatorId, d.expectedOperatorId);
    });
    kickMailer();
    res.json({ ok: true });
  }),
);

/**
 * Үе 4 — олноор хуваарилах (≤100). Бүгд эсвэл юу ч биш: аль нэг нь зэрэгцээ өөрчлөгдсөн бол бүхэлд нь буцааж,
 * зөрсөн дугааруудыг 409-д заана.
 */
r.put(
  '/assignments',
  wrap(async (req, res) => {
    const d = parse(
      z.object({
        operatorId: z.number().int().positive(),
        items: z
          .array(z.object({ publicId: z.string().min(1).max(36), expectedOperatorId: z.number().int().positive().nullable() }))
          .min(1, 'Дор хаяж нэг мэдүүлэг сонгоно уу.')
          .max(100, 'Нэг удаад 100 хүртэл мэдүүлэг.'),
      }),
      req.body,
    );
    const unique = new Set(d.items.map((x) => x.publicId));
    if (unique.size !== d.items.length) throw badRequest('Давхардсан мэдүүлэг байна.');
    await tx(async (q) => {
      await requireActiveOperator(q, d.operatorId);
      const conflicts = [];
      for (const it of d.items) {
        try {
          await assignOne(q, req, it.publicId, d.operatorId, it.expectedOperatorId);
        } catch (e) {
          if (e.status !== 409) throw e;
          conflicts.push(it.publicId);
        }
      }
      if (conflicts.length)
        throw conflict(`${conflicts.length} мэдүүлгийн хуваарилалт өөрчлөгдсөн байна. Дахин уншаад сонгоно уу.`, { conflicts });
    });
    kickMailer();
    res.json({ ok: true, assigned: d.items.length });
  }),
);

// ───────────── Зураг 61 Үйлдлийн бүртгэл (зөвхөн унших) ─────────────
r.get(
  '/audit',
  wrap(async (req, res) => {
    const f = parse(
      z.object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        action: z.string().max(64).optional(),
        actor: z.string().max(254).optional(),
        page: z.coerce.number().int().min(1).default(1),
      }),
      req.query,
    );
    const where = ['1=1'];
    const params = [];
    if (f.from) {
      where.push('e.occurred_at >= ?');
      params.push(`${f.from} 00:00:00`);
    }
    if (f.to) {
      where.push('e.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(f.to);
    }
    if (f.action) {
      where.push('e.action = ?');
      params.push(f.action);
    }
    if (f.actor) {
      where.push('u.email LIKE ?');
      params.push(`%${f.actor}%`);
    }
    const pageSize = 50;
    const total = await one(
      `SELECT COUNT(*) AS n FROM audit_events e LEFT JOIN users u ON u.user_id = e.actor_id WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await query(
      `SELECT e.*, u.email AS actor_email, u.display_name AS actor_name, a.public_id AS app_ref
       FROM audit_events e LEFT JOIN users u ON u.user_id = e.actor_id LEFT JOIN applications a ON a.application_id = e.application_id
      WHERE ${where.join(' AND ')} ORDER BY e.event_id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (f.page - 1) * pageSize],
    );
    const actions = await query('SELECT DISTINCT action FROM audit_events ORDER BY action');
    res.json({
      total: Number(total.n),
      page: f.page,
      pageSize,
      actions: actions.map((a) => a.action),
      items: rows.map((e) => ({
        id: e.event_id,
        action: e.action,
        entityType: e.entity_type,
        entityKey: e.entity_key,
        requestId: e.request_id,
        actor: e.actor_email ? `${e.actor_name} <${e.actor_email}>` : '—',
        applicationRef: e.app_ref,
        occurredAt: e.occurred_at,
      })),
    });
  }),
);

export default r;
