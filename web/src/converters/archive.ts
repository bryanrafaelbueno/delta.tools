import { unzipSync, zipSync, gunzipSync, gzipSync, untarSync, tarSync, strToU8, strFromU8 } from 'fflate';
import { registry } from './registry';
import type { ConvertInput } from '../types';

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerArchiveConverters(): void {
  // ZIP <-> 7Z handled by browser-safe toggling where possible; here we do zip/tar/gz
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
      async (input) => {
        const bytes = new Uint8Array(input.data);
        let files: Record<string, Uint8Array> = {};
        let dirs: string[] = [];

        if (from === 'zip') files = unzipSync(bytes);
        if (from === 'tar') {
          const t = untarSync(bytes);
          t.forEach((f) => {
            if (f.type === 'directory') dirs.push(f.name);
            else files[f.name] = f.data;
          });
        }
        if (from === 'gz') {
          const inner = gunzipSync(bytes);
          const name = baseNoExt(input.name) + '-extracted';
          files[name] = inner;
        }

        const outName = `${baseNoExt(input.name)}.${to}`;
        if (to === 'zip') {
          const zipped = zipSync(files, { level: 6 });
          return { name: outName, type: 'application/zip', data: zipped.buffer as ArrayBuffer };
        }
        if (to === 'tar') {
          const tarball = tarSync({ ...dirs.reduce((a, d) => ((a[d] = new Uint8Array(0)), a), {} as Record<string, Uint8Array>), ...files });
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

  // TXT -> any archive is useless; instead expose an "extract" style: gz of a text file
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
    async (input) => {
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
    async (input) => {
      const bytes = gunzipSync(new Uint8Array(input.data));
      const text = strFromU8(bytes);
      return { name: `${baseNoExt(input.name)}.txt`, type: 'text/plain', data: strToU8(text).buffer as ArrayBuffer };
    },
  );
}
