import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { put as blobPut, list as blobList } from '@vercel/blob';

// --- Storage strategy ---
// Local dev:  SQLite file in ./data (persistent).
// Vercel:     serverless functions have an ephemeral filesystem, so the SQLite
//             file lives in /tmp and is persisted to Vercel Blob between
//             invocations (downloaded on cold start, uploaded after writes).
//             This keeps every query in this codebase untouched.

const __dirname = dirname(fileURLToPath(import.meta.url));
const isVercel = !!process.env.VERCEL;
const dataDir = isVercel ? '/tmp' : join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const dbPath = join(dataDir, 'delta.db');

const BLOB_NAME = 'delta.db';
const storeId = process.env.BLOB_STORE_ID;

async function loadFromBlob() {
  if (!isVercel || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { blobs } = await blobList({ prefix: BLOB_NAME, storeId });
    const blob = blobs.find((b) => b.pathname === BLOB_NAME);
    if (blob) {
      const dl = await fetch(blob.url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        cache: 'no-store',
      });
      if (dl.ok) {
        writeFileSync(dbPath, Buffer.from(await dl.arrayBuffer()));
      }
    }
  } catch (e) {
    console.error('[db] load failed:', (e && e.message) || e);
  }
}

let savePromise = Promise.resolve();
export function persistNow() {
  if (!isVercel || !process.env.BLOB_READ_WRITE_TOKEN) return Promise.resolve();
  // Serialize uploads; each write waits for the previous one to finish so the
  // /tmp file (which grows in place) is always uploaded in order.
  savePromise = savePromise.then(async () => {
    if (!existsSync(dbPath)) return;
    const buf = readFileSync(dbPath);
    console.error(`[db] uploading ${buf.length}B`);
    await blobPut(BLOB_NAME, buf, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      storeId,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    console.error(`[db] uploaded ok`);
  }).catch((e) => {
    console.error('[db] persist failed:', (e && e.message) || e);
  });
  return savePromise;
}

export const db = new DatabaseSync(dbPath);

export const dbReady = isVercel
  ? loadFromBlob().then(() => {
      // migrations ran on the fresh file; re-apply once the persisted DB loads
      try {
        const cols = db.prepare(`PRAGMA table_info(plugins)`).all().map((c) => c.name);
        if (!cols.includes('status')) db.exec(`ALTER TABLE plugins ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
        if (!cols.includes('reviewed_at')) db.exec(`ALTER TABLE plugins ADD COLUMN reviewed_at TEXT`);
        if (!cols.includes('reviewed_by')) db.exec(`ALTER TABLE plugins ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
        if (!cols.includes('icon_color')) db.exec(`ALTER TABLE plugins ADD COLUMN icon_color TEXT`);
      } catch {
        // DB already migrated
      }
    })
  : Promise.resolve();

db.exec(`
  PRAGMA journal_mode = ${isVercel ? 'DELETE' : 'WAL'};

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
    icon TEXT NOT NULL DEFAULT 'https://api.iconify.design/mdi/puzzle.svg?color=%2300d4aa',
    icon_color TEXT,
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
if (!pluginCols.includes('icon_color')) {
  db.exec(`ALTER TABLE plugins ADD COLUMN icon_color TEXT`);
}
