// Үе 4 — админы тайлан/статистик. Зөвхөн нэгтгэсэн тоо: мэдүүлэгчийн нэр, анкет, лавлах дугаар БУЦААХГҮЙ.
// Илгээлт (долоо хоног/сараар), илгээснээс эхний үнэлгээ хүртэлх хугацаа, операторын ачаалал, төлөвийн хуваарилалт.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { wrap, parse } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
r.use(requireRole('ADMIN'));

const pad = (n) => String(n).padStart(2, '0');

/** ISO долоо хоног: 2026-W07 */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${pad(w)}`;
}
const monthKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

/** Сүүлийн N үеийн түлхүүрүүд (хоосон үеийг 0-ээр бөглөхөд) */
function buckets(period, n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    if (period === 'week') d.setUTCDate(d.getUTCDate() - i * 7);
    else d.setUTCMonth(d.getUTCMonth() - i, 1);
    const k = period === 'week' ? isoWeek(d) : monthKey(d);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : null);
const hours = (m) => (m === null || m === undefined ? null : Math.round((m / 60) * 10) / 10);

r.get(
  '/stats',
  wrap(async (req, res) => {
    const { period, count } = parse(
      z.object({
        period: z.enum(['week', 'month']).default('week'),
        count: z.coerce.number().int().min(1).max(52).default(12),
      }),
      req.query,
    );
    const keys = buckets(period, count);
    const since = new Date();
    if (period === 'week') since.setUTCDate(since.getUTCDate() - count * 7 - 7);
    else since.setUTCMonth(since.getUTCMonth() - count, 1);

    // Илгээлт ба эхний үнэлгээ хүртэлх хугацаа (мэдүүлэг бүрийн нэгтгэлгүй мөр серверээс гарахгүй)
    const rows = await query(
      `SELECT a.submitted_at,
              TIMESTAMPDIFF(MINUTE, a.submitted_at, (SELECT MIN(r.reviewed_at) FROM reviews r WHERE r.application_id = a.application_id)) AS first_review_min
         FROM applications a WHERE a.status <> 'DRAFT' AND a.submitted_at >= ?`,
      [since],
    );
    const series = Object.fromEntries(keys.map((k) => [k, { submitted: 0, reviewed: 0, minutes: [] }]));
    const allMinutes = [];
    for (const x of rows) {
      const k = period === 'week' ? isoWeek(new Date(x.submitted_at)) : monthKey(new Date(x.submitted_at));
      if (!series[k]) continue;
      series[k].submitted += 1;
      if (x.first_review_min !== null) {
        series[k].reviewed += 1;
        series[k].minutes.push(Number(x.first_review_min));
        allMinutes.push(Number(x.first_review_min));
      }
    }
    allMinutes.sort((a, b) => a - b);

    const status = await query("SELECT status, COUNT(*) AS n FROM applications WHERE status <> 'DRAFT' GROUP BY status");
    const ops = await query(
      `SELECT u.user_id, u.display_name, u.is_active,
              (SELECT COUNT(*) FROM applications a WHERE a.assigned_operator_id = u.user_id AND a.status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE')) AS open_n,
              (SELECT COUNT(*) FROM reviews r WHERE r.operator_id = u.user_id AND r.reviewed_at >= ?) AS reviews_n,
              (SELECT COUNT(*) FROM application_handovers h WHERE h.operator_id = u.user_id AND h.recorded_at >= ?) AS handovers_n
         FROM users u JOIN roles ro ON ro.role_id = u.role_id WHERE ro.code = 'OPERATOR' ORDER BY u.display_name`,
      [since, since],
    );
    const unassigned = await query(
      "SELECT COUNT(*) AS n FROM applications WHERE status IN ('SUBMITTED','IN_REVIEW','INCOMPLETE') AND assigned_operator_id IS NULL",
    );

    res.json({
      period,
      since,
      series: keys.map((k) => {
        const m = series[k].minutes.sort((a, b) => a - b);
        return {
          bucket: k,
          submitted: series[k].submitted,
          reviewed: series[k].reviewed,
          medianHoursToFirstReview: hours(quantile(m, 0.5)),
        };
      }),
      timeToFirstReview: {
        count: allMinutes.length,
        medianHours: hours(quantile(allMinutes, 0.5)),
        p90Hours: hours(quantile(allMinutes, 0.9)),
        avgHours: allMinutes.length ? hours(allMinutes.reduce((s, x) => s + x, 0) / allMinutes.length) : null,
      },
      byStatus: Object.fromEntries(status.map((x) => [x.status, Number(x.n)])),
      unassignedOpen: Number(unassigned[0].n),
      operators: ops.map((o) => ({
        id: o.user_id,
        name: o.display_name,
        active: !!o.is_active,
        open: Number(o.open_n),
        reviews: Number(o.reviews_n),
        handovers: Number(o.handovers_n),
      })),
    });
  }),
);

export default r;
