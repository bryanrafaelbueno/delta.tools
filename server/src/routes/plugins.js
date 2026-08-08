import { Router } from 'express';
import { db } from '../db.js';
import { userFromToken } from '../auth.js';

export const pluginsRouter = Router();

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
    status: row.status,
    created_at: row.created_at,
  };
}

// Public marketplace: only approved plugins
pluginsRouter.get('/', (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM plugins WHERE status = 'approved' ORDER BY created_at DESC")
    .all();
  res.json({ plugins: rows.map(rowToPlugin) });
});

pluginsRouter.get('/:id', (req, res) => {
  const row = db
    .prepare("SELECT * FROM plugins WHERE id = ? AND status = 'approved'")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Plugin not found' });
  res.json({ plugin: rowToPlugin(row) });
});

pluginsRouter.post('/', (req, res) => {
  const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user) return res.status(401).json({ error: 'Sign in to publish plugins' });

  const { id, name, version, description, icon, inputs, outputs, entry, _delete } = req.body ?? {};

  if (_delete) {
    const existing = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Plugin not found' });
    if (existing.author_id !== user.id) return res.status(403).json({ error: 'Only the author can delete this plugin' });
    db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
    return res.json({ ok: true });
  }

  const err = validate(id, name, version, description, inputs, outputs, entry);
  if (err) return res.status(400).json({ error: err });

  const existing = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
  if (existing) {
    if (existing.author_id !== user.id) {
      return res.status(403).json({ error: 'Plugin id is already taken by another author' });
    }
    // Updates go back to moderation
    db.prepare(
      `UPDATE plugins SET name=?, version=?, description=?, icon=?, inputs=?, outputs=?, entry=?, status='pending', reviewed_at=NULL, reviewed_by=NULL WHERE id=?`,
    ).run(name, version, description, icon ?? '🧩', JSON.stringify(inputs), JSON.stringify(outputs), entry, id);
    const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
    return res.json({ plugin: rowToPlugin(row) });
  }

  db.prepare(
    `INSERT INTO plugins (id, name, version, description, author, icon, inputs, outputs, entry, status, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, name, version, description, user.username, icon ?? '🧩', JSON.stringify(inputs), JSON.stringify(outputs), entry, user.id);
  const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(id);
  res.status(201).json({ plugin: rowToPlugin(row) });
});

// Bump download count when a plugin is fetched (used by clients on install)
pluginsRouter.post('/:id/install', (req, res) => {
  const info = db.prepare('UPDATE plugins SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Plugin not found' });
  res.json({ ok: true });
});

function validate(id, name, version, description, inputs, outputs, entry) {
  if (!id || typeof id !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,63}$/.test(id)) {
    return 'id must be a lowercase reverse-domain identifier, e.g. com.example.tool';
  }
  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 60) return 'name is required (2-60 chars)';
  if (!version || typeof version !== 'string') return 'version is required';
  if (!description || typeof description !== 'string') return 'description is required';
  if (!Array.isArray(inputs) || inputs.length === 0 || !inputs.every((i) => typeof i === 'string' && /^[a-z0-9]{1,8}$/.test(i))) {
    return 'inputs must be a non-empty array of file extensions';
  }
  if (!Array.isArray(outputs) || outputs.length === 0 || !outputs.every((o) => typeof o === 'string' && /^[a-z0-9]{1,8}$/.test(o))) {
    return 'outputs must be a non-empty array of file extensions';
  }
  if (!entry || typeof entry !== 'string' || entry.length > 200_000) {
    return 'entry (plugin code) is required and must be under 200KB';
  }
  return null;
}
