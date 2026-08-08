import { db } from './db.js';

// Seeds the marketplace with example community plugins so the site
// has content out of the box. Run: node src/seed.js
// These are demo/sample plugins (not security-audited, sandboxed anyway).

const plugins = [
  {
    id: 'com.delta.example.svg-png',
    name: 'SVG to PNG',
    version: '1.0.0',
    description: 'Rasterize SVG files into crisp PNG images using an offscreen canvas.',
    author: 'delta',
    icon: '✒️',
    inputs: ['svg'],
    outputs: ['png'],
    entry: `return {
  convert: async (input) => {
    const text = new TextDecoder().decode(input.data);
    const svgBlob = new Blob([text], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 512;
    canvas.height = img.naturalHeight || 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return await blob.arrayBuffer();
  }
};`,
  },
  {
    id: 'com.delta.example.md-html',
    name: 'Markdown to HTML',
    version: '1.0.0',
    description: 'Turns a Markdown document into a standalone HTML page (code fences, lists, tables).',
    author: 'delta',
    icon: '📝',
    inputs: ['md'],
    outputs: ['html'],
    entry: `return {
  convert: async (input) => {
    const md = new TextDecoder().decode(input.data);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = esc(md)
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^\\s*[-*] (.*)$/gm, '<li>$1</li>')
      .replace(/(?:<li>.*<\\/li>\\n?)+/g, (m) => '<ul>\\n' + m + '</ul>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>')
      .replace(/\\n\\n/g, '</p><p>')
      .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
    html = '<p>' + html + '</p>';
    const doc = '<!doctype html><html><head><meta charset="utf-8"><title>Converted</title><style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6}</style></head><body>' + html + '</body></html>';
    return new TextEncoder().encode(doc).buffer;
  }
};`,
  },
  {
    id: 'com.delta.example-2x-upscale',
    name: 'Image 2x Upscale (nearest)',
    version: '1.0.0',
    description: 'Doubles image resolution using nearest-neighbor scaling. Great for pixel art.',
    author: 'delta',
    icon: '🔍',
    inputs: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    outputs: ['png'],
    entry: `return {
  convert: async (input) => {
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width * 2;
    canvas.height = bitmap.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return await blob.arrayBuffer();
  }
};`,
  },
  {
    id: 'com.delta.example-txt-uppercase',
    name: 'UPPERCASE Text',
    version: '1.0.0',
    description: 'Converts any text file to uppercase. A tiny demo plugin for learning the API.',
    author: 'delta',
    icon: '🔠',
    inputs: ['txt', 'md', 'csv', 'json'],
    outputs: ['txt'],
    entry: `return {
  convert: async (input) => {
    const text = new TextDecoder().decode(input.data);
    return new TextEncoder().encode(text.toUpperCase()).buffer;
  }
};`,
  },
  {
    id: 'com.delta.example-webp-jpg',
    name: 'WebP to JPG (best effort)',
    version: '1.0.0',
    description: 'Community fallback converter when native WebP decode is unavailable.',
    author: 'delta',
    icon: '🌐',
    inputs: ['webp'],
    outputs: ['jpg'],
    entry: `return {
  convert: async (input) => {
    const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return await blob.arrayBuffer();
  }
};`,
  },
];

export function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM plugins').get().c;
  if (count > 0) {
    console.log('Marketplace already seeded — skipping.');
    return;
  }
  const insert = db.prepare(
    `INSERT INTO plugins (id, name, version, description, author, icon, inputs, outputs, entry, downloads, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  for (const p of plugins) {
    insert.run(p.id, p.name, p.version, p.description, p.author, p.icon, JSON.stringify(p.inputs), JSON.stringify(p.outputs), p.entry, 0);
  }
  console.log(`Seeded ${plugins.length} community plugins.`);
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed();
}
