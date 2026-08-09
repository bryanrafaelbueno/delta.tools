import { Router } from 'express';
import { db, persistNow } from '../db.js';
import { userFromToken } from '../auth.js';

export const favoritesRouter = Router();

function authed(req, res) {
  const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

favoritesRouter.get('/', (req, res) => {
  const user = authed(req, res);
  if (!user) return;
  const rows = db
    .prepare('SELECT tool_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(user.id);
  res.json({ favorites: rows.map((r) => r.tool_id) });
});

favoritesRouter.post('/', async (req, res) => {
  const user = authed(req, res);
  if (!user) return;
  const { toolId } = req.body ?? {};
  if (!toolId || typeof toolId !== 'string' || toolId.length > 120) {
    return res.status(400).json({ error: 'toolId is required' });
  }
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, tool_id) VALUES (?, ?)').run(user.id, toolId);
  await persistNow();
  res.json({ ok: true });
});

favoritesRouter.delete('/:toolId', async (req, res) => {
  const user = authed(req, res);
  if (!user) return;
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND tool_id = ?').run(user.id, req.params.toolId);
  await persistNow();
  res.json({ ok: true });
});
