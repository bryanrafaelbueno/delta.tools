// E2E test for every built-in converter tool.
//
// Runs against the Vite dev server in headless Chrome (real canvas,
// ffmpeg.wasm, pdfjs). For each registered builtin converter it:
//   1. builds a valid input file for the "from" format,
//   2. runs the converter,
//   3. validates the output (magic bytes / decodability / content).
//
// Usage:  node tests/all-tools.test.mjs
// (starts its own Vite + server if not already running)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { zipSync, gzipSync, strToU8 } from 'fflate';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// archives generated in node (fflate) and injected as base64
const helloU8 = strToU8('hello from archive');
const zipBytes = zipSync({ 'a.txt': helloU8 });
const gzBytes = gzipSync(helloU8);
const tarBytes = buildTar({ 'a.txt': helloU8 });
const b64 = (u8) => Buffer.from(u8).toString('base64');
const ARCHIVE_INPUTS = {
  zip: b64(zipBytes),
  gz: b64(gzBytes),
  tar: b64(tarBytes),
};

function buildTar(files) {
  const enc = new TextEncoder();
  const blocks = [];
  for (const [name, data] of Object.entries(files)) {
    const header = new Uint8Array(512);
    header.set(enc.encode(name).subarray(0, 100));
    header.set(enc.encode(data.length.toString(8).padStart(11, '0')).subarray(0, 12), 124);
    header[156] = 48;
    header.set(enc.encode('ustar\u000000').subarray(0, 8), 257);
    for (let i = 148; i < 156; i++) header[i] = 32;
    const sum = header.reduce((a, b) => a + b, 0);
    header.set(enc.encode(sum.toString(8).padStart(6, '0') + '\u0000 ').subarray(0, 8), 148);
    blocks.push(header, data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }
  blocks.push(new Uint8Array(512), new Uint8Array(512));
  const total = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) { out.set(b, off); off += b.length; }
  return out;
}

// --- bring up services if needed ---
async function ensureUp() {
  let serverUp = false;
  try {
    const r = await fetch('http://localhost:3001/api/health');
    serverUp = r.ok;
  } catch {}
  let webUp = false;
  try {
    const r = await fetch('http://localhost:5173/');
    webUp = r.ok;
  } catch {}
  const procs = [];
  if (!serverUp) {
    const p = spawn('node', ['src/index.js'], { cwd: new URL('../../server', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stderr.on('data', () => {});
    procs.push(p);
    console.log('  [setup] starting server…');
  }
  if (!webUp) {
    const p = spawn('npm', ['run', 'dev'], { cwd: new URL('..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stderr.on('data', () => {});
    procs.push(p);
    console.log('  [setup] starting vite…');
  }
  for (let i = 0; i < 40; i++) {
    try {
      const a = await fetch('http://localhost:5173/');
      const b = await fetch('http://localhost:3001/api/health');
      if (a.ok && b.ok) return procs;
    } catch {}
    await sleep(500);
  }
  throw new Error('services did not come up');
}

// --- headless chrome via CDP ---
async function openChrome() {
  const port = 9600 + Math.floor(Math.random() * 100);
  const chrome = spawn('google-chrome-stable', [
    '--headless', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/opencode/cdp-all-tools-${port}`,
    'about:blank',
  ]);
  chrome.stderr.on('data', () => {});
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
      break;
    } catch {
      await sleep(300);
    }
  }
  if (!targets) throw new Error('chrome did not start');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d.result);
      pending.delete(d.id);
    }
  };
  const send = (m, p = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    }
    return r.result?.value;
  };
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(3000);
  return { chrome, ws, ev };
}

// --- the actual test suite, runs inside the browser ---
const HARNESS = String.raw`
(async () => {
  const out = { tools: [], inputFailures: [], skipped: [] };
  const ARCHIVE_INPUTS = ${JSON.stringify(ARCHIVE_INPUTS)};
  const log = (msg) => { /* noop */ };

  // ---------- input builders ----------

  function canvasImage(mime, w = 48, h = 32, quality) {
    return new Promise((resolve, reject) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2);
      ctx.fill();
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob ' + mime))), mime, quality);
    });
  }

  // minimal ICO container holding a PNG (Chrome decodes PNG-in-ICO)
  function pngToIco(pngBytes) {
    const header = new Uint8Array(6 + 16);
    header[0] = 0; header[1] = 1; // type
    header[2] = 1; header[3] = 0; // count
    header[4] = 48; header[5] = 32; // width/height (0 = 256)
    header[6] = 0; header[7] = 0; // colors
    header[8] = 0; header[9] = 0; // reserved
    const plane = new DataView(header.buffer, 10, 2); plane.setUint16(0, 1, true);
    const bpp = new DataView(header.buffer, 12, 2); bpp.setUint16(0, 32, true);
    const size = new DataView(header.buffer, 14, 4); size.setUint32(0, pngBytes.length, true);
    const offset = new DataView(header.buffer, 18, 4); offset.setUint32(0, 22, true);
    return new Blob([header, pngBytes], { type: 'image/x-icon' });
  }

  function wavBytes(sec = 0.5) {
    const rate = 8000, ch = 1, bits = 16;
    const n = Math.floor(rate * sec);
    const dataLen = n * ch * (bits / 8);
    const buf = new ArrayBuffer(44 + dataLen);
    const v = new DataView(buf);
    const wstr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, ch, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * ch * (bits / 8), true); v.setUint16(32, ch * (bits / 8), true);
    v.setUint16(34, bits, true); wstr(36, 'data'); v.setUint32(40, dataLen, true);
    for (let i = 0; i < n; i++) {
      const sample = Math.sin(2 * Math.PI * 440 * (i / rate)) * 0.4 * 32767;
      v.setInt16(44 + i * 2, sample, true);
    }
    return buf;
  }

  async function minimalPdf() {
    // hand-built minimal 1-page PDF (no deps)
    const enc = new TextEncoder();
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
      '4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 18 Tf 20 100 Td (Delta tools test) Tj ET\nendstream\nendobj\n',
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ];
    let body = objects.join('');
    let xref = '0 5\n0000000000 65535 f \n';
    let offset = 0;
    const parts = ['%PDF-1.4\n'];
    for (const o of objects) {
      xref += String(offset).padStart(10, '0') + ' 00000 n \n';
      parts.push(o);
      offset += enc.encode(o).length;
    }
    parts.push('xref\n' + xref + 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + offset + '\n%%EOF\n');
    return enc.encode(parts.join('')).buffer;
  }

  // ---------- ffmpeg helpers ----------

  async function ff() {
    const m = await import('/src/converters/media.ts');
    return m.getFfmpeg();
  }

  async function ffConvert(ffmpeg, inName, inBytes, outName, args) {
    // ffmpeg.writeFile transfers (detaches) the buffer — always pass a clone
    const copy = new Uint8Array(inBytes.byteLength);
    copy.set(new Uint8Array(inBytes));
    await ffmpeg.writeFile(inName, copy);
    await ffmpeg.exec(args);
    const out = await ffmpeg.readFile(outName);
    await ffmpeg.deleteFile(inName);
    await ffmpeg.deleteFile(outName);
    // deleteFile may detach the returned buffer; clone before returning
    const safe = new Uint8Array(out.byteLength);
    safe.set(out);
    return safe;
  }

  // ---------- validators ----------

  function magic(bytes, hex) {
    const b = new Uint8Array(bytes);
    return hex.every((h, i) => b[i] === h);
  }

  function validate(ext, bytes, result) {
    const b = new Uint8Array(bytes);
    switch (ext) {
      case 'png': return magic(b, [0x89, 0x50, 0x4e, 0x47]);
      case 'jpg':
      case 'jpeg': return magic(b, [0xff, 0xd8]);
      case 'webp': return magic(b, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
      case 'bmp': return magic(b, [0x42, 0x4d]);
      case 'ico': return magic(b, [0x00, 0x00, 0x01, 0x00]);
      case 'gif': return magic(b, [0x47, 0x49, 0x46, 0x38]);
      case 'avif': {
        const s = new TextDecoder().decode(b.slice(4, 16));
        return s.includes('ftyp') && s.includes('avif');
      }
      case 'mp3': return magic(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
      case 'wav': return magic(b, [0x52, 0x49, 0x46, 0x46]) && new TextDecoder().decode(b.slice(8, 12)) === 'WAVE';
      case 'ogg':
      case 'opus': return magic(b, [0x4f, 0x67, 0x67, 0x53]);
      case 'flac': return magic(b, [0x66, 0x4c, 0x61, 0x43]);
      case 'aac': return b[0] === 0xff && (b[1] & 0xf0) === 0xf0;
      case 'm4a': return new TextDecoder().decode(b.slice(4, 8)) === 'ftyp';
      case 'mp4': return new TextDecoder().decode(b.slice(4, 8)) === 'ftyp';
      case 'webm':
      case 'mkv': return magic(b, [0x1a, 0x45, 0xdf, 0xa3]);
      case 'mov': return new TextDecoder().decode(b.slice(4, 8)) === 'ftyp' || new TextDecoder().decode(b.slice(4, 8)) === 'moov' || magic(b, [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
      case 'avi': return magic(b, [0x52, 0x49, 0x46, 0x46]) && new TextDecoder().decode(b.slice(8, 12)) === 'AVI ';
      case 'pdf': return magic(b, [0x25, 0x50, 0x44, 0x46]);
      case 'zip': return magic(b, [0x50, 0x4b, 0x03, 0x04]) || magic(b, [0x50, 0x4b, 0x05, 0x06]);
      case 'gz': return magic(b, [0x1f, 0x8b]);
      case 'tar': return new TextDecoder().decode(b.slice(257, 262)) === 'ustar';
      case 'txt':
      case 'json':
      case 'csv':
      case 'md':
      case 'html': return bytes.byteLength > 0;
      default: return bytes.byteLength > 0;
    }
  }

  // decodability check for image outputs
  async function decodes(bytes, mime) {
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
      const ok = bmp.width > 0 && bmp.height > 0;
      bmp.close();
      return ok;
    } catch {
      return false;
    }
  }

  // ---------- main ----------

  const { registerBuiltinConverters } = await import('/src/converters/index.ts');
  const { registry } = await import('/src/converters/registry.ts');
  registerBuiltinConverters();

  const tools = registry.all().filter((c) => c.def.source === 'builtin');
  out.total = tools.length;
  out.toolsById = tools.map((t) => t.def.id);

  // ---- generate inputs ----
  const inputs = {};
  const failInput = (ext, msg) => out.inputFailures.push(ext + ': ' + msg);

  try {
    const pngBlob = await canvasImage('image/png');
    window.__PNG_BUF = await pngBlob.arrayBuffer();
    inputs.png = { name: 't.png', ext: 'png', type: 'image/png', data: window.__PNG_BUF };
    inputs.ico = { name: 't.ico', ext: 'ico', type: 'image/x-icon', data: await pngToIco(new Uint8Array(window.__PNG_BUF)).arrayBuffer() };
    for (const [ext, mime] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp'], ['bmp', 'image/bmp'], ['avif', 'image/avif']]) {
      try {
        const blob = await canvasImage(mime);
        inputs[ext] = { name: 't.' + ext, ext, type: mime, data: await blob.arrayBuffer() };
      } catch {
        failInput(ext, 'canvas toBlob failed');
      }
    }
    // gif: canvas cannot encode gif -> make from png via ffmpeg later
  } catch (e) {
    failInput('images', String(e && e.message || e));
  }

  // text inputs
  const enc = (s) => new TextEncoder().encode(s).buffer;
  inputs.txt = { name: 't.txt', ext: 'txt', type: 'text/plain', data: enc('hello delta tools\nline two\n') };
  inputs.json = { name: 't.json', ext: 'json', type: 'application/json', data: enc('{"name":"delta","nums":[1,2,3],"ok":true}') };
  inputs.csv = { name: 't.csv', ext: 'csv', type: 'text/csv', data: enc('name,age,city\nana,30,sao paulo\nbob,25,rio\n') };
  inputs.md = { name: 't.md', ext: 'md', type: 'text/markdown', data: enc('# Title\n\nSome **bold** text\n') };
  inputs.html = { name: 't.html', ext: 'html', type: 'text/html', data: enc('<html><body><h1>Hi</h1></body></html>') };

  // archives via fflate (bytes generated in node, passed as base64)
  const b64ToBuf = (b64s) => {
    const bin = atob(b64s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  };
  inputs.zip = { name: 't.zip', ext: 'zip', type: 'application/zip', data: b64ToBuf(ARCHIVE_INPUTS.zip) };
  inputs.gz = { name: 't.gz', ext: 'gz', type: 'application/gzip', data: b64ToBuf(ARCHIVE_INPUTS.gz) };
  inputs.tar = { name: 't.tar', ext: 'tar', type: 'application/x-tar', data: b64ToBuf(ARCHIVE_INPUTS.tar) };

  // pdf
  try {
    const pdfBytes = await minimalPdf();
    inputs.pdf = { name: 't.pdf', ext: 'pdf', type: 'application/pdf', data: pdfBytes };
  } catch (e) {
    failInput('pdf', String(e && e.message || e));
  }

  // ---- media inputs via ffmpeg ----
  try {
    const ffmpeg = await ff();
    out.ffmpegLoaded = true;

    // wav (hand-made), then derive other audio formats
    inputs.wav = { name: 't.wav', ext: 'wav', type: 'audio/wav', data: wavBytes() };
    const wavU8 = new Uint8Array(inputs.wav.data);
    const audioMap = {
      mp3: ['-i', 'in.wav', '-vn', '-acodec', 'libmp3lame', '-q:a', '4', '-y', 'out.mp3'],
      ogg: ['-i', 'in.wav', '-vn', '-acodec', 'libvorbis', '-y', 'out.ogg'],
      flac: ['-i', 'in.wav', '-vn', '-acodec', 'flac', '-y', 'out.flac'],
      aac: ['-i', 'in.wav', '-vn', '-acodec', 'aac', '-y', 'out.aac'],
      m4a: ['-i', 'in.wav', '-vn', '-acodec', 'aac', '-y', 'out.m4a'],
      opus: ['-i', 'in.wav', '-vn', '-acodec', 'libopus', '-y', 'out.opus'],
    };
    for (const [ext, args] of Object.entries(audioMap)) {
      try {
        const u8 = await ffConvert(ffmpeg, 'in.wav', wavU8, 'out.' + ext, args);
        inputs[ext] = { name: 't.' + ext, ext, type: 'audio/' + ext, data: u8.buffer };
      } catch (e) {
        failInput(ext, String(e && e.message || e));
      }
    }

    // video: generate a tiny test clip, then containers
    const A = ['-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest'];
    const videoMap = {
      mp4: ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=10', ...A, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', 'out.mp4'],
      mkv: ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=10', ...A, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', 'out.mkv'],
      mov: ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=10', ...A, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', 'out.mov'],
      avi: ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=10', ...A, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', 'out.avi'],
    };
    for (const [ext, args] of Object.entries(videoMap)) {
      try {
        const u8 = await ffConvert(ffmpeg, 'src0', new Uint8Array(wavU8), 'out.' + ext, args);
        inputs[ext] = { name: 't.' + ext, ext, type: 'video/' + ext, data: u8.buffer };
      } catch (e) {
        failInput(ext, String(e && e.message || e));
      }
    }

    // gif input: png -> gif
    try {
      const gif = await ffConvert(ffmpeg, 'in.png', new Uint8Array(window.__PNG_BUF), 'out.gif', ['-i', 'in.png', '-y', 'out.gif']);
      inputs.gif = { name: 't.gif', ext: 'gif', type: 'image/gif', data: gif.buffer };
    } catch (e) {
      failInput('gif', String(e && e.message || e));
    }

    // ico via ffmpeg (ico encoder) if available, else keep manual png-in-ico
    try {
      const ico = await ffConvert(ffmpeg, 'in.png', new Uint8Array(window.__PNG_BUF), 'out.ico', ['-i', 'in.png', '-y', 'out.ico']);
      inputs.ico = { name: 't.ico', ext: 'ico', type: 'image/x-icon', data: ico.buffer };
    } catch (e) {
      failInput('ico', 'ffmpeg: ' + String(e && e.message || e));
    }

    // avif fallback via ffmpeg if canvas failed
    if (!inputs.avif) {
      try {
        const avif = await ffConvert(ffmpeg, 'in.png', new Uint8Array(window.__PNG_BUF), 'out.avif', ['-i', 'in.png', '-c:v', 'libaom-av1', '-y', 'out.avif']);
        inputs.avif = { name: 't.avif', ext: 'avif', type: 'image/avif', data: avif.buffer };
      } catch (e) {
        failInput('avif', 'ffmpeg libaom: ' + String(e && e.message || e));
      }
    }
  } catch (e) {
    out.ffmpegError = String(e && e.message || e);
  }
  out.generatedInputs = Object.keys(inputs).join(',');
  out.ffAborts = (window.__FFERR || []).filter((x) => x.startsWith('ABORT')).length;
  try {
    const { getFfmpeg } = await import('/src/converters/media.ts');
    const f = await getFfmpeg();
    const ffmpegErrors = [];
    let execCount = 0;
    f.on('log', (e) => {
      if (/abort/i.test(e.message)) ffmpegErrors.push('ABORT@exec' + execCount);
      else if (/error|failed|invalid/i.test(e.message)) ffmpegErrors.push(e.message.slice(0, 120));
    });
    window.__FFERR = ffmpegErrors;
    const origExec = f.exec.bind(f);
    f.exec = async (...a) => { const r = await origExec(...a); execCount++; return r; };
  } catch {}
  const captureErr = () => { try { return (window.__FFERR || []).slice(-25); } catch { return []; } };
  let execCounter = 0;
  try {
    const m2 = await import('/src/converters/media.ts');
    const f2 = await m2.getFfmpeg();
    const origExec2 = f2.exec.bind(f2);
    f2.exec = async (...a) => { const r = await origExec2(...a); execCounter++; return r; };
  } catch {}

  // ---- run every tool ----
  const MIME_LOOKUP = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp',
    ico: 'image/x-icon', avif: 'image/avif', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    m4a: 'audio/mp4', opus: 'audio/opus', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', pdf: 'application/pdf', zip: 'application/zip',
    tar: 'application/x-tar', gz: 'application/gzip', txt: 'text/plain', json: 'application/json',
    csv: 'text/csv', md: 'text/markdown', html: 'text/html',
  };

  for (const tool of tools) {
    const { def } = tool;
    const id = def.id;
    const input = inputs[def.from];
    if (!input) {
      out.skipped.push({ id, reason: 'no input available for .' + def.from });
      continue;
    }
    if (def.to === 'pdf-merge') {
      // multi-file flow handled by the tool page, not the converter
      out.skipped.push({ id, reason: 'multi-file flow (tool page)' });
      continue;
    }
    const started = performance.now();
    let status, detail, outputBytes = null;
    try {
      // clone the input bytes: some converters (ffmpeg) detach the buffer
      const inputCopy = new ArrayBuffer(input.data.byteLength);
      new Uint8Array(inputCopy).set(new Uint8Array(input.data));
      const result = await Promise.race([
        tool.run({ name: 't.' + def.from, type: input.type, ext: def.from, data: inputCopy }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 90s')), 90000)),
      ]);
      outputBytes = result.data;
      if (!(outputBytes instanceof ArrayBuffer)) {
        status = 'FAIL';
        detail = 'output is not ArrayBuffer';
      } else {
        const magicOk = validate(def.to, outputBytes, result);
        let decodeOk = true;
        if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'ico', 'avif', 'gif'].includes(def.to) && magicOk) {
          decodeOk = await decodes(outputBytes, MIME_LOOKUP[def.to] || result.type);
        }
        if (magicOk && decodeOk) {
          status = 'PASS';
        } else {
          status = 'FAIL';
          detail = 'magic=' + magicOk + ' decode=' + decodeOk + ' type=' + (result.type || 'none') + ' size=' + outputBytes.byteLength;
        }
      }
    } catch (e) {
      status = 'FAIL';
      detail = (String(e && e.message || e) + ' | ' + String(e && e.stack || '')).slice(0, 600);
      if (def.category === 'audio' || def.category === 'video') {
        detail += ' | execs=' + execCounter + ' | ffmpeg-log: ' + captureErr().join(' ;; ').slice(0, 400);
      }
    }
    out.tools.push({
      id,
      name: def.name,
      from: def.from,
      to: def.to,
      status,
      detail: detail || '',
      ms: Math.round(performance.now() - started),
    });
  }

  return out;
})()
`;

const procs = await ensureUp();
const { chrome, ws, ev } = await openChrome();

console.log('Running full converter suite… (media tools download ffmpeg.wasm first, this can take a while)\n');
const result = await ev(HARNESS);

if (result && result.error) {
  console.error('HARNESS ERROR:', result.error);
} else if (result && result.tools) {
  const passed = result.tools.filter((t) => t.status === 'PASS');
  const failed = result.tools.filter((t) => t.status === 'FAIL');
  const skipped = [...result.skipped, ...result.inputFailures.map((f) => ({ id: 'INPUT', reason: f }))];
  console.log(`Total tools: ${result.tools.length}  |  PASS: ${passed.length}  |  FAIL: ${failed.length}  |  skipped/missing-inputs: ${skipped.length}`);
  console.log('ffmpeg loaded:', result.ffmpegLoaded, ' ffmpegError:', result.ffmpegError || 'none');
  console.log('generated inputs:', result.generatedInputs || 'NONE');
  console.log('ffmpeg aborts:', result.ffAborts ?? 'n/a');
  console.log('');
  if (failed.length) {
    console.log('=== FAILED ===');
    for (const f of failed) {
      console.log(`  [${f.from}->${f.to}] ${f.id}  (${f.ms}ms)\n      ${f.detail}`);
    }
    console.log('');
  }
  if (skipped.length) {
    console.log('=== SKIPPED / MISSING INPUTS ===');
    for (const s of skipped) console.log(`  ${s.id}: ${s.reason}`);
    console.log('');
  }
  console.log('=== PASS LIST ===');
  for (const p of passed) console.log(`  ${p.id}`);
  console.log('');
  console.log(`RESULT: ${failed.length === 0 && passed.length > 0 ? 'ALL PASS' : failed.length + ' FAILURES'}`);
} else {
  console.log('No result:', JSON.stringify(result).slice(0, 500));
}

ws.close();
chrome.kill();
for (const p of procs) p.kill('SIGKILL');
process.exit(0);
