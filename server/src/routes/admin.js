import { Router } from 'express';
import { db } from '../db.js';
import { userFromToken } from '../auth.js';

export const adminRouter = Router();

function isAdmin(req) {
  const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user || user.role !== 'Developer') return null;
  return user;
}

function rowToPlugin(row) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    icon: row.icon,
    inputs: JSON.parse(row.inputs),
    outputs: JSON.parse(row.outputs),
    entry: row.entry,
    downloads: row.downloads,
    iconColor: row.icon_color || undefined,
    status: row.status,
    created_at: row.created_at,
  };
}

// All plugins, newest first, pending on top
adminRouter.get('/plugins', (req, res) => {
  const admin = isAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });
  const rows = db
    .prepare(
      `SELECT * FROM plugins
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END, created_at DESC`,
    )
    .all();
  res.json({ plugins: rows.map(rowToPlugin) });
});

// Approve or reject a plugin (and any future update)
adminRouter.post('/plugins/:id/review', (req, res) => {
  const admin = isAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  const { action } = req.body ?? {};
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Plugin not found' });

  db.prepare(
    `UPDATE plugins SET status = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`,
  ).run(action === 'approve' ? 'approved' : 'rejected', admin.id, req.params.id);

  res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected' });
});
