import { Router } from 'express';
import { query, one } from '../db.js';
import { wrap, notFound } from '../lib/errors.js';
import { LATEST_PUBLISHED, canApply, applyBlockReason } from '../lib/visa.js';
import { config } from '../config.js';

const r = Router();

// Зураг 37 Нүүр хуудас — улсын картууд
r.get(
  '/countries',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT country_id, iso_code, name_mn, service_status, official_result_url
       FROM countries WHERE service_status <> 'DISABLED' ORDER BY (service_status='ACTIVE') DESC, name_mn`,
    );
    res.json({
      countries: rows.map((c) => ({
        id: c.country_id,
        iso: c.iso_code,
        name: c.name_mn,
        status: c.service_status,
        submittable: c.service_status === 'ACTIVE' && config.submittableCountries.includes(c.iso_code),
        officialResultUrl: c.official_result_url,
      })),
    });
  }),
);

// UC-03 / Зураг 40 Визийн мэдээлэл хайх — зөвхөн нийтэлсэн хамгийн сүүлийн хувилбар
r.get(
  '/visas',
  wrap(async (req, res) => {
    const where = ['v.published_at IS NOT NULL', `v.version_no = ${LATEST_PUBLISHED}`, "c.service_status <> 'DISABLED'"];
    const params = [];
    if (req.query.country) {
      where.push('c.iso_code = ?');
      params.push(String(req.query.country).toUpperCase());
    }
    if (req.query.q) {
      where.push('(v.name_mn LIKE ? OR t.code LIKE ? OR v.description LIKE ?)');
      const like = `%${String(req.query.q).slice(0, 100)}%`;
      params.push(like, like, like);
    }
    const rows = await query(
      `SELECT v.version_id, v.version_no, v.name_mn, v.description, v.verified_at, v.published_at, v.source_url,
            t.visa_type_id, t.code, t.is_active AS type_active, c.iso_code, c.name_mn AS country_name, c.service_status,
            ${LATEST_PUBLISHED} AS latest_no,
            (SELECT COUNT(*) FROM visa_requirements q WHERE q.version_id = v.version_id) AS req_count
       FROM visa_info_versions v
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id
       JOIN countries c ON c.country_id = t.country_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.name_mn, t.code`,
      params,
    );
    res.json({
      visas: rows.map((v) => ({
        versionId: v.version_id,
        versionNo: v.version_no,
        code: v.code,
        name: v.name_mn,
        description: v.description,
        country: { iso: v.iso_code, name: v.country_name, status: v.service_status },
        verifiedAt: v.verified_at,
        publishedAt: v.published_at,
        sourceUrl: v.source_url,
        requirementCount: v.req_count,
        canApply: canApply(v),
      })),
    });
  }),
);

// Зураг 41 Визийн төрөл ба шаардлага
r.get(
  '/visas/:versionId',
  wrap(async (req, res) => {
    const id = Number(req.params.versionId);
    if (!Number.isInteger(id)) throw notFound();
    const v = await one(
      `SELECT v.*, t.code, t.is_active AS type_active, c.iso_code, c.name_mn AS country_name, c.service_status,
            c.official_result_url, ${LATEST_PUBLISHED} AS latest_no
       FROM visa_info_versions v
       JOIN visa_types t ON t.visa_type_id = v.visa_type_id
       JOIN countries c ON c.country_id = t.country_id
      WHERE v.version_id = ? AND v.published_at IS NOT NULL`,
      [id],
    );
    if (!v) throw notFound('Нийтлэгдсэн визийн мэдээлэл олдсонгүй.');
    const reqs = await query(
      'SELECT requirement_id, code, title, instructions, is_required FROM visa_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id',
      [id],
    );
    res.json({
      visa: {
        versionId: v.version_id,
        versionNo: v.version_no,
        isLatest: v.version_no === v.latest_no,
        code: v.code,
        name: v.name_mn,
        description: v.description,
        sourceUrl: v.source_url,
        verifiedAt: v.verified_at,
        publishedAt: v.published_at,
        country: { iso: v.iso_code, name: v.country_name, status: v.service_status, officialResultUrl: v.official_result_url },
        canApply: canApply(v),
        blockReason: applyBlockReason(v),
        requirements: reqs.map((q) => ({
          id: q.requirement_id,
          code: q.code,
          title: q.title,
          instructions: q.instructions,
          isRequired: !!q.is_required,
        })),
      },
    });
  }),
);

export default r;
