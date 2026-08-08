// Renders a plugin icon: an SVG url (optionally tinted with a color) or a fallback.
//
// Cross-origin <img> is blocked by COEP: require-corp (needed for ffmpeg.wasm), so
// SVGs from external hosts are fetched as text through our server proxy and
// inlined as data URIs. While loading, a CSS placeholder is shown (never alt text).
//
// Coloring works by rewriting the SVG itself (monochrome): every fill/stroke is
// replaced with the target color, so any icon can be shown solid black, white,
// green, etc. The raw SVG text is cached so switching colors needs no refetch.

const svgCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const PERSIST_KEY = 'delta_svg_texts_v1';
const PERSIST_MAX = 400;

function loadPersisted(): Map<string, string> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return new Map();
  }
}

function persist(entries: Array<[string, string]>): void {
  try {
    const all = { ...Object.fromEntries(loadPersisted()), ...Object.fromEntries(entries) };
    const keys = Object.keys(all);
    if (keys.length > PERSIST_MAX) {
      for (const k of keys.slice(0, keys.length - PERSIST_MAX)) delete all[k];
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify(all));
  } catch {
    // storage full — ignore
  }
}

function dataUriToText(uri: string): string | null {
  const m = uri.match(/^data:image\/svg\+xml(;base64)?,(.*)$/s);
  if (!m) return null;
  try {
    if (m[1]) {
      return decodeURIComponent(escape(atob(m[2])));
    }
    return decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

async function fetchSvgText(url: string): Promise<string | null> {
  if (url.startsWith('data:')) {
    // Custom user icons are stored as data URIs; decode them so they can be tinted.
    return dataUriToText(url);
  }
  const cached = svgCache.get(url);
  if (cached) return cached;
  const persisted = loadPersisted().get(url);
  if (persisted) {
    svgCache.set(url, persisted);
    return persisted;
  }
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = (async () => {
    try {
      // Go through our server proxy: same-origin, no CORS/COEP/rate-limit issues.
      const res = await fetch(`/api/icons/svg?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text.trim()) return null;
      svgCache.set(url, text);
      persist([[url, text]]);
      return text;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

// Replaces every fill/stroke/stop-color (attribute and style forms) with the
// target hex, turning any icon solid. `none`/`transparent` are preserved.
// Icons whose paths declare no fill at all (they inherit the root / default
// black) get the color injected on the root <svg> so everything inherits it.
export function monochromeSvg(svg: string, hex: string): string {
  const c = hex.toLowerCase();
  let out = svg.replace(/\s(fill|stroke|stop-color)="([^"]*)"/g, (_m, prop, val) => {
    if (val === 'none' || val === 'transparent') return ` ${prop}="none"`;
    return ` ${prop}="${c}"`;
  });
  out = out.replace(/(fill|stroke|stop-color)\s*:\s*([^;"']+)/g, (_m, prop, val) => {
    if (val.trim() === 'none' || val.trim() === 'transparent') return `${prop}:none`;
    return `${prop}:${c}`;
  });
  // Root has no fill of its own -> inject one so fill-less paths inherit it.
  out = out.replace(/^<svg\b([^>]*)>/, (m, attrs) => {
    if (/\bfill=/.test(attrs)) return m;
    return `<svg${attrs} fill="${c}">`;
  });
  return out;
}

export function svgToDataUri(svg: string, color?: string): string {
  // SVGs from SVGL often omit the xmlns attribute. That's fine inline in HTML,
  // but as a standalone SVG document (e.g. in <img src>) the XML namespace is
  // required — without it the image fails to decode and shows a broken icon.
  let s = svg.trim().replace(/^<svg\b([^>]*)>/, (m, attrs) => {
    if (/\bxmlns=/.test(attrs)) return m;
    return `<svg xmlns="http://www.w3.org/2000/svg"${attrs}>`;
  });
  if (color) s = monochromeSvg(s, color);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s)))}`;
}

// Renders a placeholder container; hydrateSvgIcons fills it with the inlined SVG.
export function renderIcon(icon: string, color?: string, size = 20): string {
  const isUrl = /^https?:\/\//.test(icon) || icon.startsWith('data:');
  if (!isUrl) {
    return `<span style="font-size:${size}px;line-height:1">${icon}</span>`;
  }
  return `<span class="svg-icon" data-src="${icon}" data-color="${color || ''}" style="width:${size}px;height:${size}px"></span>`;
}

// Fetches one SVG and returns its data URI, optionally tinted; used by the picker.
export async function inlineSvg(url: string, color?: string): Promise<string | null> {
  const text = await fetchSvgText(url);
  if (!text) return null;
  return svgToDataUri(text, color);
}

// Fills a .svg-icon placeholder with the inlined SVG (tinted via the XML rewrite).
async function fillIcon(el: HTMLElement): Promise<void> {
  const url = el.dataset.src!;
  const text = await fetchSvgText(url);
  if (!text) {
    el.removeAttribute('data-src');
    el.classList.add('svg-icon-failed');
    el.style.background = 'var(--hover)';
    return;
  }
  const uri = svgToDataUri(text, el.dataset.color || '');
  el.innerHTML = `<img src="${uri}" alt="" style="width:100%;height:100%;object-fit:contain"/>`;
  el.removeAttribute('data-src');
  el.removeAttribute('data-color');
}

// Fetches every pending .svg-icon under root and fills it. Uses a small
// concurrency pool so we never hammer the icon APIs (rate limits).
export async function hydrateSvgIcons(root: ParentNode = document, concurrency = 10): Promise<void> {
  const els = [...root.querySelectorAll('.svg-icon[data-src]')] as HTMLElement[];
  let i = 0;
  async function worker(): Promise<void> {
    while (i < els.length) {
      const el = els[i++];
      await fillIcon(el);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, els.length) }, worker));
}

// Same as hydrateSvgIcons but returns immediately.
export function hydrateSvgIconsAsync(root: ParentNode = document, concurrency = 10): void {
  void hydrateSvgIcons(root, concurrency);
}
