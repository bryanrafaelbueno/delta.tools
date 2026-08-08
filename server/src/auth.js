import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { db } from './db.js';
import { JWT_SECRET } from './env.js';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (s) => Buffer.from(s).toString('base64url');
const DAY = 24 * 60 * 60 * 1000;

export function createSession(userId) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: String(userId),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + 30 * DAY) / 1000),
    }),
  );
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function userFromToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims.sub || typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;

  const row = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(claims.sub);
  return row ?? null;
}

export function publicUser(row) {
  return { id: String(row.id), username: row.username, role: row.role, created_at: row.created_at };
}
