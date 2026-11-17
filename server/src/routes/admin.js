import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, one, tx } from '../db.js';
import { wrap, parse, notFound, conflict, badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { STATUS_LABEL } from '../lib/visa.js';
import { requireRole } from '../middleware/auth.js';
import { passwordSchema, BCRYPT_ROUNDS } from './auth.js';

/**
 * Админ: улс, визийн төрөл, мэдээллийн хувилбар, шаардлага, хэрэглэгч, хуваарилалт, үйлдлийн бүртгэл.
 * Админы эрх нь хувийн анкет, хавсралтыг унших эрх БИШ — энд анкет/файлын endpoint байхгүй.
 */
const r = Router();
r.use(requireRole('ADMIN'));

const httpsUrl = z.string().trim().max(2048).url('URL буруу байна.').refine((u) => u.startsWith('https://'), 'Зөвхөн HTTPS холбоос зөвшөөрнө.');
const optionalHttpsUrl = z.union([httpsUrl, z.literal('').transform(() => null), z.null()]).optional();
const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

// ───────────── Зураг 54 Самбар ─────────────
r.get('/dashboard', wrap(async (_req, res) => {
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
}));

// ───────────── Зураг 55 Улс ─────────────
const countrySchema = z.object({
  isoCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 код (2 үсэг).'),
  nameMn: z.string().trim().min(2, 'Монгол нэрийг оруулна уу.').max(100),
  serviceStatus: z.enum(['ACTIVE', 'COMING_SOON', 'DISABLED']),
  officialResultUrl: optionalHttpsUrl,
});

r.get('/countries', wrap(async (_req, res) => {
  const rows = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM visa_types t WHERE t.country_id = c.country_id) AS type_count FROM countries c ORDER BY c.name_mn`,
  );
  res.json({
    countries: rows.map((c) => ({
      id: c.country_id, isoCode: c.iso_code, nameMn: c.name_mn, serviceStatus: c.service_status,
      officialResultUrl: c.official_result_url, typeCount: Number(c.type_count),
    })),
  });
}));

async function saveCountry(req, res, id) {
  const d = parse(countrySchema, req.body);
  try {
    const key = await tx(async (q) => {
      let cid = id;
      if (id) {
        const u = await q('UPDATE countries SET iso_code=?, name_mn=?, service_status=?, official_result_url=? WHERE country_id=?',
          [d.isoCode, d.nameMn, d.serviceStatus, d.officialResultUrl ?? null, id]);
        if (!u.affectedRows) throw notFound('Улс олдсонгүй.');
      } else {
        cid = (await q('INSERT INTO countries (iso_code, name_mn, service_status, official_result_url) VALUES (?,?,?,?)',
          [d.isoCode, d.nameMn, d.serviceStatus, d.officialResultUrl ?? null])).insertId;
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
r.post('/countries', wrap((req, res) => saveCountry(req, res, null)));
r.put('/countries/:id', wrap((req, res) => saveCountry(req, res, idParam(req.params.id))));
r.delete('/countries/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const c = await one('SELECT iso_code, (SELECT COUNT(*) FROM visa_types t WHERE t.country_id = c.country_id) AS n FROM countries c WHERE country_id = ?', [id]);
  if (!c) throw notFound('Улс олдсонгүй.');
  if (Number(c.n) > 0) throw conflict('Визийн төрөлтэй холбоотой улсыг устгахгүй. Төлөвийг нь өөрчилнө үү.');
  await tx(async (q) => {
    await q('DELETE FROM countries WHERE country_id = ?', [id]);
    await audit(req, { action: 'COUNTRY_DELETE', entityType: 'country', entityKey: c.iso_code }, q);
  });
  res.json({ ok: true });
}));

// ───────────── Зураг 56 Визийн төрөл ─────────────
r.get('/visa-types', wrap(async (_req, res) => {
  const rows = await query(
    `SELECT t.*, c.iso_code, c.name_mn AS country_name,
            (SELECT COUNT(*) FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id) AS version_count,
            (SELECT MAX(v.version_no) FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id AND v.published_at IS NOT NULL) AS published_no,
            (SELECT v.name_mn FROM visa_info_versions v WHERE v.visa_type_id = t.visa_type_id ORDER BY v.version_no DESC LIMIT 1) AS latest_name
       FROM visa_types t JOIN countries c ON c.country_id = t.country_id ORDER BY c.name_mn, t.code`,
  );
  res.json({
    visaTypes: rows.map((t) => ({
      id: t.visa_type_id, code: t.code, isActive: !!t.is_active, country: { id: t.country_id, iso: t.iso_code, name: t.country_name },
      versionCount: Number(t.version_count), publishedVersionNo: t.published_no, latestName: t.latest_name,
    })),
  });
}));

const typeSchema = z.object({
  countryId: z.coerce.number().int().positive('Улс сонгоно уу.'),
  code: z.string().trim().toUpperCase().min(1, 'Код оруулна уу.').max(30).regex(/^[A-Z0-9-]+$/, 'Код: латин том үсэг, тоо, зураас.'),
  isActive: z.boolean(),
});
async function saveType(req, res, id) {
  const d = parse(typeSchema, req.body);
  try {
    const key = await tx(async (q) => {
      let tid = id;
      if (id) {
        const u = await q('UPDATE visa_types SET country_id=?, code=?, is_active=? WHERE visa_type_id=?', [d.countryId, d.code, d.isActive, id]);
        if (!u.affectedRows) throw notFound('Визийн төрөл олдсонгүй.');
      } else {
        tid = (await q('INSERT INTO visa_types (country_id, code, is_active) VALUES (?,?,?)', [d.countryId, d.code, d.isActive])).insertId;
      }
      await audit(req, { action: id ? 'VISA_TYPE_UPDATE' : 'VISA_TYPE_CREATE', entityType: 'visa_type', entityKey: tid }, q);
      return tid;
    });
    res.status(id ? 200 : 201).json({ id: key });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('Энэ улсад ижил код бүртгэлтэй байна.', { fields: { code: 'Улс дотор код давхардаж байна.' } });
    if (e.code === 'ER_NO_REFERENCED_ROW_2') throw badRequest('Улс олдсонгүй.');
    throw e;
  }
}
r.post('/visa-types', wrap((req, res) => saveType(req, res, null)));
r.put('/visa-types/:id', wrap((req, res) => saveType(req, res, idParam(req.params.id))));

// ───────────── Зураг 57 Мэдээллийн хувилбар ─────────────
function serializeVersion(v) {
  return {
    id: v.version_id, visaTypeId: v.visa_type_id, versionNo: v.version_no, nameMn: v.name_mn, description: v.description,
    sourceUrl: v.source_url, verifiedAt: v.verified_at, createdAt: v.created_at, publishedAt: v.published_at,
    createdBy: v.creator_name, requirementCount: v.req_count !== undefined ? Number(v.req_count) : undefined,
    applicationCount: v.app_count !== undefined ? Number(v.app_count) : undefined,
  };
}

r.get('/visa-types/:id/versions', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const t = await one('SELECT t.*, c.name_mn AS country_name, c.iso_code FROM visa_types t JOIN countries c ON c.country_id = t.country_id WHERE visa_type_id = ?', [id]);
  if (!t) throw notFound('Визийн төрөл олдсонгүй.');
  const rows = await query(
    `SELECT v.*, u.display_name AS creator_name,
            (SELECT COUNT(*) FROM visa_requirements q WHERE q.version_id = v.version_id) AS req_count,
            (SELECT COUNT(*) FROM applications a WHERE a.version_id = v.version_id) AS app_count
       FROM visa_info_versions v JOIN users u ON u.user_id = v.created_by WHERE v.visa_type_id = ? ORDER BY v.version_no DESC`,
    [id],
  );
  res.json({ visaType: { id: t.visa_type_id, code: t.code, isActive: !!t.is_active, country: { name: t.country_name, iso: t.iso_code } }, versions: rows.map(serializeVersion) });
}));

const versionSchema = z.object({
  nameMn: z.string().trim().min(2, 'Нэр оруулна уу.').max(180),
  description: z.string().trim().max(20000).optional().default(''),
  sourceUrl: optionalHttpsUrl,
  verifiedAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу.'), z.literal('').transform(() => null), z.null()]).optional(),
});

// Шинэ хувилбар (хоосон эсвэл нийтэлсэн хувилбараас хуулж). version_no-г сервер тооцоолно.
r.post('/visa-types/:id/versions', wrap(async (req, res) => {
  const typeId = idParam(req.params.id);
  const copyFrom = req.body?.copyFromVersionId ? Number(req.body.copyFromVersionId) : null;
  const d = copyFrom ? null : parse(versionSchema, req.body);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const out = await tx(async (q) => {
        const t = (await q('SELECT visa_type_id FROM visa_types WHERE visa_type_id = ? FOR UPDATE', [typeId]))[0];
        if (!t) throw notFound('Визийн төрөл олдсонгүй.');
        const next = Number((await q('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM visa_info_versions WHERE visa_type_id = ?', [typeId]))[0].n);
        let src = d;
        let srcReqs = [];
        if (copyFrom) {
          const sv = (await q('SELECT * FROM visa_info_versions WHERE version_id = ? AND visa_type_id = ?', [copyFrom, typeId]))[0];
          if (!sv) throw notFound('Хуулах хувилбар олдсонгүй.');
          src = { nameMn: sv.name_mn, description: sv.description, sourceUrl: sv.source_url, verifiedAt: sv.verified_at };
          srcReqs = await q('SELECT * FROM visa_requirements WHERE version_id = ?', [copyFrom]);
        }
        const ins = await q(
          `INSERT INTO visa_info_versions (visa_type_id, version_no, name_mn, description, source_url, verified_at, created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [typeId, next, src.nameMn, src.description || null, src.sourceUrl ?? null, src.verifiedAt ?? null, req.user.id],
        );
        for (const sr of srcReqs) {
          await q('INSERT INTO visa_requirements (version_id, code, title, instructions, is_required, sort_order) VALUES (?,?,?,?,?,?)',
            [ins.insertId, sr.code, sr.title, sr.instructions, sr.is_required, sr.sort_order]);
        }
        await audit(req, { action: 'VERSION_CREATE', entityType: 'visa_info_version', entityKey: ins.insertId }, q);
        return { id: ins.insertId, versionNo: next };
      });
      return res.status(201).json(out);
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || attempt === 2) throw e;
    }
  }
}));

async function loadVersion(id) {
  const v = await one(
    `SELECT v.*, u.display_name AS creator_name, t.code AS type_code, c.name_mn AS country_name
       FROM visa_info_versions v JOIN users u ON u.user_id = v.created_by
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id JOIN countries c ON c.country_id = t.country_id
      WHERE v.version_id = ?`,
    [id],
  );
  if (!v) throw notFound('Хувилбар олдсонгүй.');
  return v;
}

r.get('/versions/:id', wrap(async (req, res) => {
  const v = await loadVersion(idParam(req.params.id));
  const reqs = await query('SELECT * FROM visa_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id', [v.version_id]);
  res.json({
    version: { ...serializeVersion(v), typeCode: v.type_code, countryName: v.country_name },
    requirements: reqs.map((q) => ({ id: q.requirement_id, code: q.code, title: q.title, instructions: q.instructions, isRequired: !!q.is_required, sortOrder: q.sort_order })),
  });
}));

/** Нийтэлсэн хувилбарыг шууд засахгүй — хуулж шинэ хувилбар үүсгэнэ. */
async function lockDraftVersion(q, id) {
  const v = (await q('SELECT version_id, published_at FROM visa_info_versions WHERE version_id = ? FOR UPDATE', [id]))[0];
  if (!v) throw notFound('Хувилбар олдсонгүй.');
  if (v.published_at) throw conflict('Нийтэлсэн хувилбарыг засахгүй. Хуулж шинэ хувилбар үүсгэнэ үү.');
  return v;
}

r.put('/versions/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const d = parse(versionSchema, req.body);
  await tx(async (q) => {
    await lockDraftVersion(q, id);
    await q('UPDATE visa_info_versions SET name_mn=?, description=?, source_url=?, verified_at=? WHERE version_id=?',
      [d.nameMn, d.description || null, d.sourceUrl ?? null, d.verifiedAt ?? null, id]);
    await audit(req, { action: 'VERSION_UPDATE', entityType: 'visa_info_version', entityKey: id }, q);
  });
  res.json({ ok: true });
}));

// BR-04 / FR-11: эх сурвалж, шалгасан огноо, шаардлагагүй бол нийтлэхгүй
r.post('/versions/:id/publish', wrap(async (req, res) => {
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
}));

r.delete('/versions/:id', wrap(async (req, res) => {
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
}));

// ───────────── Зураг 58 Материалын шаардлага ─────────────
const reqSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, 'Код оруулна уу.').max(40).regex(/^[A-Z0-9_-]+$/, 'Код: латин том үсэг, тоо, _ -'),
  title: z.string().trim().min(2, 'Нэр оруулна уу.').max(200),
  instructions: z.string().trim().max(5000).optional().default(''),
  isRequired: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(65535).default(0),
});

r.post('/versions/:id/requirements', wrap(async (req, res) => {
  const vid = idParam(req.params.id);
  const d = parse(reqSchema, req.body);
  try {
    const id = await tx(async (q) => {
      await lockDraftVersion(q, vid);
      const ins = await q('INSERT INTO visa_requirements (version_id, code, title, instructions, is_required, sort_order) VALUES (?,?,?,?,?,?)',
        [vid, d.code, d.title, d.instructions || null, d.isRequired, d.sortOrder]);
      await audit(req, { action: 'REQUIREMENT_CREATE', entityType: 'visa_requirement', entityKey: ins.insertId }, q);
      return ins.insertId;
    });
    res.status(201).json({ id });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('Нэг хувилбарт код давхардаж байна.', { fields: { code: 'Код давхардаж байна.' } });
    throw e;
  }
}));

r.put('/requirements/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const d = parse(reqSchema, req.body);
  try {
    await tx(async (q) => {
      const row = (await q('SELECT version_id FROM visa_requirements WHERE requirement_id = ?', [id]))[0];
      if (!row) throw notFound('Шаардлага олдсонгүй.');
      await lockDraftVersion(q, row.version_id);
      await q('UPDATE visa_requirements SET code=?, title=?, instructions=?, is_required=?, sort_order=? WHERE requirement_id=?',
        [d.code, d.title, d.instructions || null, d.isRequired, d.sortOrder, id]);
      await audit(req, { action: 'REQUIREMENT_UPDATE', entityType: 'visa_requirement', entityKey: id }, q);
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('Нэг хувилбарт код давхардаж байна.', { fields: { code: 'Код давхардаж байна.' } });
    throw e;
  }
}));

r.delete('/requirements/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await tx(async (q) => {
    const row = (await q('SELECT version_id FROM visa_requirements WHERE requirement_id = ?', [id]))[0];
    if (!row) throw notFound('Шаардлага олдсонгүй.');
    await lockDraftVersion(q, row.version_id);
    await q('DELETE FROM visa_requirements WHERE requirement_id = ?', [id]);
    await audit(req, { action: 'REQUIREMENT_DELETE', entityType: 'visa_requirement', entityKey: id }, q);
  });
  res.json({ ok: true });
}));

// ───────────── Зураг 59 Хэрэглэгч ба эрх ─────────────
r.get('/users', wrap(async (req, res) => {
  const role = ['APPLICANT', 'OPERATOR', 'ADMIN'].includes(req.query.role) ? req.query.role : null;
  const q = req.query.q ? `%${String(req.query.q).slice(0, 80)}%` : null;
  const rows = await query(
    `SELECT u.user_id, u.public_id, u.email, u.display_name, u.is_active, u.created_at, r.code AS role,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_operator_id = u.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS open_assignments
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE (? IS NULL OR r.code = ?) AND (? IS NULL OR u.email LIKE ? OR u.display_name LIKE ?)
      ORDER BY r.code, u.display_name LIMIT 500`,
    [role, role, q, q, q],
  );
  res.json({
    users: rows.map((u) => ({
      id: u.user_id, email: u.email, name: u.display_name, role: u.role, isActive: !!u.is_active, createdAt: u.created_at,
      openAssignments: Number(u.open_assignments),
    })),
  });
}));

r.post('/users', wrap(async (req, res) => {
  const d = parse(z.object({
    name: z.string().trim().min(2, 'Нэр оруулна уу.').max(150),
    email: z.string().trim().toLowerCase().email('Имэйлийн хэлбэр буруу байна.').max(254),
    password: passwordSchema,
    role: z.enum(['OPERATOR', 'ADMIN'], { errorMap: () => ({ message: 'OPERATOR эсвэл ADMIN эрх сонгоно уу.' }) }),
  }), req.body);
  const hash = await bcrypt.hash(d.password, BCRYPT_ROUNDS);
  try {
    const id = await tx(async (q) => {
      const ins = await q(
        `INSERT INTO users (public_id, role_id, email, password_hash, display_name) VALUES (?, (SELECT role_id FROM roles WHERE code = ?), ?, ?, ?)`,
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
}));

r.put('/users/:id/status', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  await tx(async (q) => {
    const u = (await q('SELECT u.user_id, u.is_active, r.code AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? FOR UPDATE', [id]))[0];
    if (!u) throw notFound('Хэрэглэгч олдсонгүй.');
    if (!isActive && u.role === 'ADMIN') {
      const n = Number((await q("SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code='ADMIN' AND u.is_active = 1 AND u.user_id <> ? FOR UPDATE", [id]))[0].n);
      if (n === 0) throw conflict('Сүүлийн идэвхтэй админыг идэвхгүй болгохгүй.');
    }
    if (!isActive && u.role === 'OPERATOR') {
      const n = Number((await q("SELECT COUNT(*) AS n FROM applications WHERE assigned_operator_id = ? AND status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')", [id]))[0].n);
      if (n > 0) throw conflict(`Энэ операторт ${n} нээлттэй мэдүүлэг хуваарилагдсан. Эхлээд дахин хуваарилна уу.`);
    }
    await q('UPDATE users SET is_active = ? WHERE user_id = ?', [isActive, id]);
    await audit(req, { action: isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', entityType: 'user', entityKey: id }, q);
  });
  res.json({ ok: true });
}));

// ───────────── Зураг 60 Хуваарилалт (зөвхөн metadata) ─────────────
r.get('/assignments', wrap(async (req, res) => {
  const filter = ['unassigned', 'assigned', 'all'].includes(req.query.filter) ? req.query.filter : 'unassigned';
  const where = ["a.status <> 'DRAFT'"];
  if (filter === 'unassigned') where.push('a.assigned_operator_id IS NULL');
  if (filter === 'assigned') where.push('a.assigned_operator_id IS NOT NULL');
  const rows = await query(
    `SELECT a.public_id, a.status, a.submitted_at, a.assigned_operator_id, t.code, c.name_mn AS country_name, uo.display_name AS operator_name
       FROM applications a JOIN visa_info_versions v ON v.version_id = a.version_id JOIN visa_types t ON t.visa_type_id = v.visa_type_id
       JOIN countries c ON c.country_id = t.country_id LEFT JOIN users uo ON uo.user_id = a.assigned_operator_id
      WHERE ${where.join(' AND ')} ORDER BY a.submitted_at ASC LIMIT 500`,
  );
  const ops = await query(
    `SELECT u.user_id, u.display_name,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_operator_id = u.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS load_n
       FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code = 'OPERATOR' AND u.is_active = 1 ORDER BY u.display_name`,
  );
  res.json({
    items: rows.map((a) => ({
      publicId: a.public_id, status: a.status, statusLabel: STATUS_LABEL[a.status], submittedAt: a.submitted_at, visaCode: a.code,
      country: a.country_name, operatorId: a.assigned_operator_id, operatorName: a.operator_name,
    })),
    operators: ops.map((o) => ({ id: o.user_id, name: o.display_name, openCount: Number(o.load_n) })),
  });
}));

r.put('/assignments/:publicId', wrap(async (req, res) => {
  const d = parse(z.object({
    operatorId: z.number().int().positive().nullable(),
    expectedOperatorId: z.number().int().positive().nullable(),
  }), req.body);
  await tx(async (q) => {
    const a = (await q("SELECT application_id, public_id, assigned_operator_id, status FROM applications WHERE public_id = ? AND status <> 'DRAFT' FOR UPDATE", [req.params.publicId]))[0];
    if (!a) throw notFound('Мэдүүлэг олдсонгүй.');
    // Зэрэгцээ өөрчлөлт → 409
    if ((a.assigned_operator_id ?? null) !== d.expectedOperatorId) throw conflict('Хуваарилалт өөр хэрэглэгчээр өөрчлөгдсөн байна. Дахин уншина уу.');
    if (d.operatorId) {
      const op = (await q("SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? AND r.code = 'OPERATOR' AND u.is_active = 1", [d.operatorId]))[0];
      if (!op) throw badRequest('Идэвхтэй оператор сонгоно уу.');
    }
    let status = a.status;
    const hasReview = Number((await q('SELECT COUNT(*) AS n FROM reviews WHERE application_id = ?', [a.application_id]))[0].n) > 0;
    if (!hasReview) status = d.operatorId ? 'IN_REVIEW' : 'SUBMITTED';
    await q('UPDATE applications SET assigned_operator_id = ?, status = ? WHERE application_id = ?', [d.operatorId, status, a.application_id]);
    await audit(req, {
      action: d.operatorId ? (a.assigned_operator_id ? 'APP_REASSIGN' : 'APP_ASSIGN') : 'APP_UNASSIGN',
      entityType: 'application', entityKey: a.public_id, applicationId: a.application_id,
    }, q);
  });
  res.json({ ok: true });
}));

// ───────────── Зураг 61 Үйлдлийн бүртгэл (зөвхөн унших) ─────────────
r.get('/audit', wrap(async (req, res) => {
  const f = parse(z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    action: z.string().max(64).optional(),
    actor: z.string().max(254).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }), req.query);
  const where = ['1=1'];
  const params = [];
  if (f.from) { where.push('e.occurred_at >= ?'); params.push(`${f.from} 00:00:00`); }
  if (f.to) { where.push('e.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(f.to); }
  if (f.action) { where.push('e.action = ?'); params.push(f.action); }
  if (f.actor) { where.push('u.email LIKE ?'); params.push(`%${f.actor}%`); }
  const pageSize = 50;
  const total = await one(`SELECT COUNT(*) AS n FROM audit_events e LEFT JOIN users u ON u.user_id = e.actor_id WHERE ${where.join(' AND ')}`, params);
  const rows = await query(
    `SELECT e.*, u.email AS actor_email, u.display_name AS actor_name, a.public_id AS app_ref
       FROM audit_events e LEFT JOIN users u ON u.user_id = e.actor_id LEFT JOIN applications a ON a.application_id = e.application_id
      WHERE ${where.join(' AND ')} ORDER BY e.event_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (f.page - 1) * pageSize],
  );
  const actions = await query('SELECT DISTINCT action FROM audit_events ORDER BY action');
  res.json({
    total: Number(total.n), page: f.page, pageSize,
    actions: actions.map((a) => a.action),
    items: rows.map((e) => ({
      id: e.event_id, action: e.action, entityType: e.entity_type, entityKey: e.entity_key, requestId: e.request_id,
      actor: e.actor_email ? `${e.actor_name} <${e.actor_email}>` : '—', applicationRef: e.app_ref, occurredAt: e.occurred_at,
    })),
  });
}));

export default r;
