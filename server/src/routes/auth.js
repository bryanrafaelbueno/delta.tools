import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, publicUser } from '../auth.js';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: 'Username must be 3-24 characters' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, . _ -' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username is already taken' });

  const { salt, hash } = hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)')
    .run(username, hash, salt);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = createSession(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

authRouter.get('/me', (req, res) => {
  const user = userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});
