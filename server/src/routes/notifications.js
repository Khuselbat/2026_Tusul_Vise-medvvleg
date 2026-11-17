// Үе 2 — систем доторх мэдэгдэл (хонх). Хэрэглэгч бүр зөвхөн өөрийнхөө мэдэгдлийг харна/уншина.
import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../db.js';
import { wrap, parse, notFound } from '../lib/errors.js';
import { render } from '../lib/notify.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

r.get(
  '/',
  wrap(async (req, res) => {
    const { limit, unread } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), unread: z.enum(['0', '1']).optional() }),
      req.query,
    );
    const rows = await query(
      `SELECT * FROM notifications WHERE user_id = ? ${unread === '1' ? 'AND read_at IS NULL' : ''}
        ORDER BY notification_id DESC LIMIT ?`,
      [req.user.id, limit],
    );
    const count = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ unread: Number(count.n), items: rows.map(render) });
  }),
);

r.post(
  '/read-all',
  wrap(async (req, res) => {
    await query('UPDATE notifications SET read_at = CURRENT_TIMESTAMP(6) WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  }),
);

r.post(
  '/:id/read',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    // Бусдын мэдэгдэл → 404 (оршин байгааг илчлэхгүй)
    const n = await query(
      'UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP(6)) WHERE notification_id = ? AND user_id = ?',
      [Number.isInteger(id) ? id : 0, req.user.id],
    );
    if (!n.affectedRows) throw notFound('Мэдэгдэл олдсонгүй.');
    res.json({ ok: true });
  }),
);

export default r;
