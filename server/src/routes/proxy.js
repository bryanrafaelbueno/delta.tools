import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// Generic HTTP proxy so plugins can fetch remote content (e.g. YouTube pages
// and stream URLs) without tripping browser CORS or the sandbox's connect-src.
//
// Prefers `curl` for upstream fetches: many sites (notably YouTube) fingerprint
// the TLS/HTTP2 stack of Node's fetch/undici and reply 429/302-to-captcha,
// while curl's OpenSSL fingerprint is treated as a browser. Falls back to
// node:https (HTTP/1.1) when curl isn't installed.
// Protects against SSRF: no private/loopback ranges, and caps the response.

export const proxyRouter = Router();

const MAX_BYTES = 256 * 1024 * 1024; // 256 MB cap (videos can be big)
const TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 6;
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const execFileAsync = promisify(execFile);
let hasCurl = null;

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^[0-9.]+$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts.length === 4) {
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
    return true; // any bare IP is treated as suspicious
  }
  return false;
}

// ---- upstream via curl (browser-like TLS fingerprint) ----

async function curlFetch(target, { method = 'GET', headers = {}, body = null }) {
  const args = [
    '-sS',
    '-L',
    '--max-time', String(Math.ceil(TIMEOUT_MS / 1000)),
    '--max-filesize', String(MAX_BYTES),
    '-H', `User-Agent: ${UA}`,
    '-H', 'Accept: */*',
    '-H', 'Accept-Language: en-US,en;q=0.9',
  ];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push('-w', '\n__STATUS:%{http_code}__TYPE:%{content_type}');
  if (method === 'POST') {
    args.push('-X', 'POST');
    if (body) {
      args.push('--data-binary', body);
      args.push('-H', 'Content-Type: text/plain');
    }
  }
  args.push(target);
  const { stdout } = await execFileAsync('curl', args, { maxBuffer: MAX_BYTES + 1024 * 1024 });
  const marker = stdout.lastIndexOf('\n__STATUS:');
  const outBody = marker >= 0 ? stdout.slice(0, marker) : stdout;
  const meta = marker >= 0 ? stdout.slice(marker + 1) : '';
  const status = Number(/__STATUS:(\d+)/.exec(meta)?.[1] ?? 502);
  const type = /__TYPE:(\S*)/.exec(meta)?.[1] || 'application/octet-stream';
  return { status, type, body: Buffer.from(outBody, 'utf8'), isCurl: true };
}

// ---- upstream via node:https (HTTP/1.1 fallback) ----

function rawFetch(url, { method = 'GET', headers = {}, body = null, redirects = 0, signal }) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return reject(Object.assign(new Error('url must be a valid absolute URL'), { code: 'EBADURL' }));
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return reject(Object.assign(new Error('only http(s) URLs are allowed'), { code: 'EBADURL' }));
    }
    if (isPrivateHost(target.hostname)) {
      return reject(Object.assign(new Error('host not allowed'), { code: 'EHOSTBLOCKED' }));
    }

    const lib = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = lib(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method,
        headers: {
          'user-agent': UA,
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
          res.resume();
          const next = new URL(res.headers.location, target);
          return resolve(rawFetch(next.toString(), { method, headers, body, redirects: redirects + 1, signal }));
        }
        resolve(res);
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error('upstream timed out'), { code: 'ETIMEDOUT' })));
    if (signal) {
      const abort = () => req.destroy(Object.assign(new Error('upstream timed out'), { code: 'ETIMEDOUT' }));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function nodeFetch(target, { method = 'GET', headers = {}, body = null }) {
  const controller = new AbortController();
  try {
    const upstream = await rawFetch(target, { method, headers, body, signal: controller.signal });
    const chunks = [];
    let received = 0;
    for await (const chunk of upstream) {
      received += chunk.length;
      if (received > MAX_BYTES) {
        upstream.destroy();
        throw Object.assign(new Error('response too large'), { code: 'ETOOLARGE' });
      }
      chunks.push(chunk);
    }
    return {
      status: upstream.statusCode,
      type: upstream.headers['content-type'] || 'application/octet-stream',
      body: Buffer.concat(chunks),
      isCurl: false,
    };
  } finally {
    controller.abort();
  }
}

async function fetchUpstream(target, opts) {
  if (hasCurl === null) {
    try {
      await execFileAsync('curl', ['--version']);
      hasCurl = true;
    } catch {
      hasCurl = false;
    }
  }
  if (hasCurl) return curlFetch(target, opts);
  return nodeFetch(target, opts);
}

async function handleProxy(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const url = String(body.url ?? req.query.url ?? '');
  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ error: 'url must be a valid absolute URL' });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'only http(s) URLs are allowed' });
  }
  if (isPrivateHost(target.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }

  const headers = {};
  if (typeof body.headers === 'object' && body.headers) {
    for (const [k, v] of Object.entries(body.headers)) {
      if (typeof v === 'string' && !/^cookie$/i.test(k) && !/^content-length$/i.test(k)) {
        headers[k] = v;
      }
    }
  }
  const method = body.method === 'POST' ? 'POST' : 'GET';
  const payload = method === 'POST' && typeof body.data === 'string' ? body.data : null;

  try {
    const upstream = await fetchUpstream(target.toString(), { method, headers, body: payload });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Url');
    res.setHeader('X-Proxy-Status', String(upstream.status));
    res.setHeader('X-Proxy-Length', String(upstream.body.length));
    res.setHeader('Content-Type', upstream.type || 'application/octet-stream');
    res.status(upstream.status);
    res.send(upstream.body);
  } catch (err) {
    if (err && err.code === 'EHOSTBLOCKED') return res.status(403).json({ error: 'host not allowed' });
    if (err && err.code === 'EBADURL') return res.status(400).json({ error: 'url must be a valid absolute URL' });
    if (err && err.code === 'ETOOLARGE') return res.status(413).json({ error: 'response too large' });
    res.status(502).json({ error: String((err && err.message) || err) });
  }
}

proxyRouter.get('/', handleProxy);
proxyRouter.post('/', handleProxy);
proxyRouter.options('/', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Url');
  res.status(204).end();
});
