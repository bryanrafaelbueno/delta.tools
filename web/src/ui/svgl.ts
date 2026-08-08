export interface SvglIcon {
  id: number;
  title: string;
  category: string | string[];
  route: string | { light: string; dark: string };
  url?: string;
  wordmark?: string;
  source?: 'svgl' | 'thesvg';
}

export interface SvglCategory {
  category: string;
  total: number;
}

const SVGL_BASE = 'https://api.svgl.app';
const THESVG_JSON = 'https://cdn.jsdelivr.net/gh/glincker/thesvg@main/src/data/icons.json';
const THESVG_CDN = 'https://thesvg.org';
const CACHE_KEY = 'delta_svgl_cache_v3';
const CUSTOM_KEY = 'delta_svgl_custom';
const CACHE_TTL = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  icons: SvglIcon[];
  categories: SvglCategory[];
}

interface TheSvgEntry {
  slug: string;
  title: string;
  aliases?: string[];
  categories: string[];
  variants: Record<string, string>;
  url?: string;
}

function loadCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.at > CACHE_TTL) return null;
    return entry;
  } catch {
    return null;
  }
}

function saveCache(icons: SvglIcon[], categories: SvglCategory[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), icons, categories }));
  } catch {
    // storage full / private mode — fine, just don't cache
  }
}

function normalizeRoute(route: string | { light: string; dark: string }): string {
  if (typeof route === 'string') return route;
  return route.light || route.dark;
}

async function fetchSvglIcons(): Promise<SvglIcon[]> {
  const res = await fetch(`/api/icons/json?url=${encodeURIComponent(SVGL_BASE)}`);
  if (!res.ok) throw new Error(`SVGL API error (${res.status})`);
  const list = (await res.json()) as SvglIcon[];
  return list.map((i) => {
    // svgl.app (the CDN) blocks CORS; api.svgl.app/svg/{file} serves the SVG with CORS.
    const file = (typeof i.route === 'string' ? i.route : i.route.light || i.route.dark)
      .split('/')
      .pop();
    return {
      ...i,
      route: file ? `${SVGL_BASE}/svg/${file}` : i.route,
      source: 'svgl' as const,
    };
  });
}

async function fetchSvglCategories(): Promise<SvglCategory[]> {
  const res = await fetch(`/api/icons/json?url=${encodeURIComponent(`${SVGL_BASE}/categories`)}`);
  if (!res.ok) throw new Error(`SVGL categories error (${res.status})`);
  return (await res.json()) as SvglCategory[];
}

// theSVG: static JSON manifest + CDN-hosted SVGs (https://thesvg.org/icons/{slug}/{variant}.svg)
async function fetchTheSvgIcons(): Promise<SvglIcon[]> {
  const res = await fetch(`/api/icons/json?url=${encodeURIComponent(THESVG_JSON)}`);
  if (!res.ok) throw new Error(`theSVG error (${res.status})`);
  const list = (await res.json()) as TheSvgEntry[];
  return list.map((entry, idx) => {
    // variants.default is already a full path: /icons/{slug}/default.svg
    const variant = entry.variants?.default || entry.variants?.color || `/icons/${entry.slug}/default.svg`;
    return {
      id: -1000000 - idx,
      title: entry.title,
      category: entry.categories ?? [],
      route: `${THESVG_CDN}${variant}`,
      url: entry.url,
      source: 'thesvg' as const,
    };
  });
}

export async function fetchIcons(): Promise<SvglIcon[]> {
  const cached = loadCache();
  if (cached) {
    // Warm server-side cache in the background even on cache hits.
    warmUpServer(cached.icons);
    return cached.icons;
  }
  const [svgl, thesvg] = await Promise.all([
    fetchSvglIcons().catch(() => []),
    fetchTheSvgIcons().catch(() => []),
  ]);
  const icons = [...svgl, ...thesvg];
  const categories = await fetchCategories();
  saveCache(icons, categories);
  // Warm our server-side SVG cache in the background.
  warmUpServer(icons);
  return icons;
}

function warmUpServer(icons: SvglIcon[]): void {
  // The grid only ever displays the first 240 icons; the rest are fetched
  // on demand by the picker. Warming the full ~8k catalog is wasteful and
  // the URL list doesn't fit in an HTTP query string, so POST a JSON body.
  const urls = icons.slice(0, 240).map((x) => iconUrl(x));
  if (!urls.length) return;
  fetch('/api/icons/warmup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  }).catch(() => undefined);
}

export async function fetchCategories(): Promise<SvglCategory[]> {
  const cached = loadCache();
  if (cached) return cached.categories;
  const [svglCats, thesvgIcons] = await Promise.all([
    fetchSvglCategories().catch(() => []),
    fetchTheSvgIcons().catch(() => []),
  ]);
  const map = new Map<string, number>();
  for (const c of svglCats) map.set(c.category, c.total);
  for (const i of thesvgIcons) {
    const cats = Array.isArray(i.category) ? i.category : [i.category];
    for (const c of cats) map.set(c, (map.get(c) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export async function fetchSvgCode(route: string | { light: string; dark: string }): Promise<string> {
  const url = normalizeRoute(route);
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Could not load SVG (${res.status})`);
  return await res.text();
}

export function iconUrl(icon: SvglIcon): string {
  const url = normalizeRoute(icon.route);
  // svgl.app CDN lacks CORS headers; rewrite to the API endpoint which serves with CORS.
  if (/^https:\/\/svgl\.app\//.test(url)) {
    const file = url.split('/').pop();
    return file ? `${SVGL_BASE}/svg/${file}` : url;
  }
  return url;
}

export function matchesQuery(icon: SvglIcon, q: string): boolean {
  const s = q.toLowerCase();
  return icon.title.toLowerCase().includes(s);
}

// --- Custom user-added icons (stored locally) ---

export interface CustomIcon extends SvglIcon {
  custom: true;
}

export function loadCustomIcons(): CustomIcon[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as CustomIcon[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCustomIcons(icons: CustomIcon[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(icons));
  } catch {
    // storage full — ignore
  }
}

export function addCustomIcon(svg: string, title: string): CustomIcon {
  const icons = loadCustomIcons();
  const nextId = icons.length
    ? Math.min(...icons.map((i) => i.id)) - 1
    : -1;
  const icon: CustomIcon = {
    id: nextId,
    title: title.trim() || 'Custom icon',
    category: 'Custom',
    route: svgToDataUri(svg),
    custom: true,
  };
  icons.unshift(icon);
  saveCustomIcons(icons);
  return icon;
}

export function removeCustomIcon(id: number): void {
  saveCustomIcons(loadCustomIcons().filter((i) => i.id !== id));
}

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
  out = out.replace(/^<svg\b([^>]*)>/, (m, attrs) => {
    if (/\bfill=/.test(attrs)) return m;
    return `<svg${attrs} fill="${c}">`;
  });
  return out;
}

export function svgToDataUri(svg: string, color?: string): string {
  // Standalone SVG documents (data URIs in <img>) require the XML namespace,
  // and an optional monochrome color rewrites every fill/stroke.
  let s = svg.trim().replace(/^<svg\b([^>]*)>/, (m, attrs) => {
    if (/\bxmlns=/.test(attrs)) return m;
    return `<svg xmlns="http://www.w3.org/2000/svg"${attrs}>`;
  });
  if (color) s = monochromeSvg(s, color);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s)))}`;
}
