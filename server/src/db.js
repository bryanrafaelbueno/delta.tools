import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'delta.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🧩',
    inputs TEXT NOT NULL,
    outputs TEXT NOT NULL,
    entry TEXT NOT NULL,
    downloads INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tool_id)
  );
`);

// Migrations for existing databases (CREATE TABLE IF NOT EXISTS won't add columns)
const pluginCols = db.prepare(`PRAGMA table_info(plugins)`).all().map((c) => c.name);
if (!pluginCols.includes('status')) {
  db.exec(`ALTER TABLE plugins ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
}
if (!pluginCols.includes('reviewed_at')) {
  db.exec(`ALTER TABLE plugins ADD COLUMN reviewed_at TEXT`);
}
if (!pluginCols.includes('reviewed_by')) {
  db.exec(`ALTER TABLE plugins ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
}
