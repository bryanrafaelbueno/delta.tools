import { Router } from 'express';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Proxies remote SVG assets through our own origin so the browser never faces
// CORS, COEP or third-party rate limits. Cache is in-memory + persisted to disk.
export const iconsRouter = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
// /tmp on Vercel (ephemeral), ./data locally
const cacheDir = process.env.VERCEL
  ? join('/tmp', 'icon-cache')
  : join(__dirname, '..', '..', 'data', 'icon-cache');
mkdirSync(cacheDir, { recursive: true });

const mem = new Map(); // url -> { at, body, type }
const TTL = 60 * 60 * 1000;
const ALLOWED_HOSTS = new Set(['api.svgl.app', 'svgl.app', 'thesvg.org', 'cdn.jsdelivr.net', 'api.iconify.design']);

function diskPath(url) {
  const name = Buffer.from(url).toString('base64url').slice(0, 120);
  return join(cacheDir, name);
}

function readDisk(url) {
  const p = diskPath(url);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}

async function fetchUpstream(url) {
  const upstream = await fetch(url, { headers: { accept: 'image/svg+xml,text/plain,application/json,*/*' } });
  if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
  return { body: Buffer.from(await upstream.arrayBuffer()), type: upstream.headers.get('content-type') || 'image/svg+xml' };
}

async function getCached(url) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const disk = readDisk(url);
  if (disk) {
    const entry = { at: Date.now(), body: disk, type: 'image/svg+xml' };
    mem.set(url, entry);
    return entry;
  }
  const entry = await fetchUpstream(url);
  mem.set(url, { at: Date.now(), body: entry.body, type: entry.type });
  try {
    writeFileSync(diskPath(url), entry.body);
  } catch {
    // ignore disk errors
  }
  return entry;
}

function warmUp(urls) {
  // fetch in background with a concurrency pool
  let i = 0;
  const POOL = 24;
  async function pump() {
    while (i < urls.length) {
      const slice = urls.slice(i, i + POOL);
      i += POOL;
      await Promise.all(slice.map(async (url) => {
        try {
          const parsed = new URL(url);
          if (!ALLOWED_HOSTS.has(parsed.hostname)) return;
          await getCached(url);
        } catch {
          // ignore individual failures
        }
      }));
    }
  }
  void pump();
}

// POST with a JSON body { urls: string[] } — query strings explode past the
// HTTP header size limit when thousands of icon URLs are prefetched.
iconsRouter.post('/warmup', (req, res) => {
  const body = req.body || {};
  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === 'string').slice(0, 500) : [];
  res.json({ ok: true, prefetched: urls.length });
  warmUp(urls);
});

iconsRouter.get('/json', async (req, res) => {
  const url = String(req.query.url ?? '');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'url must be a valid absolute URL' });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }
  try {
    const entry = await getCached(url);
    res.setHeader('Content-Type', entry.type || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(entry.body);
  } catch (err) {
    res.status(502).json({ error: String(err && err.message || err) });
  }
});

iconsRouter.get('/svg', async (req, res) => {
  const url = String(req.query.url ?? '');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'url must be a valid absolute URL' });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }
  try {
    const entry = await getCached(url);
    res.setHeader('Content-Type', entry.type || 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(entry.body);
  } catch (err) {
    res.status(502).json({ error: String(err && err.message || err) });
  }
});
