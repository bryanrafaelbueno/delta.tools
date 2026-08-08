import { unzipSync, zipSync, gunzipSync, gzipSync, strToU8, strFromU8 } from 'fflate';
import { registry } from './registry';
import type { ConvertInput } from '../types';

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// ---- Minimal TAR read/write (ustar, 512-byte blocks) ----

interface TarEntry {
  name: string;
  data: Uint8Array;
  type: 'file' | 'dir';
}

function untar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  while (off + 512 <= bytes.length) {
    const header = bytes.subarray(off, off + 512);
    const nameEnd = header.indexOf(0);
    const name = nameEnd < 0 ? '' : new TextDecoder().decode(header.subarray(0, nameEnd));
    if (name.length === 0) break;
    const typeFlag = String.fromCharCode(header[156] || 48);
    const sizeStr = new TextDecoder().decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const isDir = typeFlag === '5' || name.endsWith('/');
    const data = bytes.subarray(off + 512, off + 512 + size);
    if (!isDir) entries.push({ name, data: new Uint8Array(data), type: 'file' });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function tar(files: Record<string, Uint8Array>): Uint8Array {
  const blocks: Uint8Array[] = [];
  const enc = new TextEncoder();

  for (const [name, data] of Object.entries(files)) {
    const header = new Uint8Array(512);
    const nameBytes = enc.encode(name);
    header.set(nameBytes.subarray(0, 100));
    const size = data.length.toString(8).padStart(11, '0');
    header.set(enc.encode(size).subarray(0, 12), 124);
    header[156] = 48; // '0' file
    const magic = enc.encode('ustar\u000000');
    header.set(magic.subarray(0, 8), 257);
    // checksum: space-filled then sum
    for (let i = 0; i < 148; i++) header[i] = header[i] || 0;
    for (let i = 148; i < 156; i++) header[i] = 32;
    for (let i = 156; i < 512; i++) header[i] = header[i] || 0;
    const sum = header.reduce((a, b) => a + b, 0);
    const sumStr = sum.toString(8).padStart(6, '0') + '\u0000 ';
    header.set(enc.encode(sumStr).subarray(0, 8), 148);
    blocks.push(header);
    blocks.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }

  // two zero blocks
  blocks.push(new Uint8Array(512), new Uint8Array(512));
  const total = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

export function registerArchiveConverters(): void {
  const pairs: Array<[string, string]> = [
    ['zip', 'tar'],
    ['zip', 'gz'],
    ['tar', 'zip'],
    ['tar', 'gz'],
    ['gz', 'zip'],
    ['gz', 'tar'],
  ];

  for (const [from, to] of pairs) {
    registry.register(
      {
        id: `arc-${from}-${to}`,
        name: `${from.toUpperCase()} to ${to.toUpperCase()}`,
        description: `Convert ${from.toUpperCase()} archive to ${to.toUpperCase()}`,
        category: 'archive',
        from,
        to,
        source: 'builtin',
        icon: '🗜️',
      },
      async (input: ConvertInput) => {
        const bytes = new Uint8Array(input.data);
        let files: Record<string, Uint8Array> = {};

        if (from === 'zip') files = unzipSync(bytes);
        if (from === 'tar') {
          for (const e of untar(bytes)) files[e.name] = e.data;
        }
        if (from === 'gz') {
          const inner = gunzipSync(bytes);
          files[`${baseNoExt(input.name)}`] = inner;
        }

        const outName = `${baseNoExt(input.name)}.${to}`;
        if (to === 'zip') {
          const zipped = zipSync(files, { level: 6 });
          return { name: outName, type: 'application/zip', data: zipped.buffer as ArrayBuffer };
        }
        if (to === 'tar') {
          const tarball = tar(files);
          return { name: outName, type: 'application/x-tar', data: tarball.buffer as ArrayBuffer };
        }
        if (to === 'gz') {
          const one = Object.values(files)[0] ?? new Uint8Array(0);
          const gz = gzipSync(one, { level: 6 });
          return { name: outName, type: 'application/gzip', data: gz.buffer as ArrayBuffer };
        }
        throw new Error(`Unsupported: ${from} -> ${to}`);
      },
    );
  }

  registry.register(
    {
      id: 'arc-txt-gz',
      name: 'TXT to GZ',
      description: 'Compress a text file to .gz',
      category: 'archive',
      from: 'txt',
      to: 'gz',
      source: 'builtin',
      icon: '🗜️',
    },
    async (input: ConvertInput) => {
      const text = new TextDecoder().decode(input.data);
      const gz = gzipSync(strToU8(text), { level: 6 });
      return { name: `${baseNoExt(input.name)}.txt.gz`, type: 'application/gzip', data: gz.buffer as ArrayBuffer };
    },
  );

  registry.register(
    {
      id: 'arc-gz-txt',
      name: 'GZ to TXT',
      description: 'Decompress a .gz file to text',
      category: 'archive',
      from: 'gz',
      to: 'txt',
      source: 'builtin',
      icon: '📝',
    },
    async (input: ConvertInput) => {
      const bytes = gunzipSync(new Uint8Array(input.data));
      const text = strFromU8(bytes);
      return { name: `${baseNoExt(input.name)}.txt`, type: 'text/plain', data: strToU8(text).buffer as ArrayBuffer };
    },
  );
}
