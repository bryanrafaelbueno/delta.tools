import { registry } from './registry';
import { svgIcons } from '../ui/svg-icons';
import type { ConvertInput } from '../types';

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerTextConverters(): void {
  registry.register(
    {
      id: 'txt-json-pretty',
      name: 'Pretty JSON',
      description: 'Format and beautify JSON text',
      category: 'text',
      from: 'json',
      to: 'json',
      source: 'builtin',
      icon: svgIcons.text,
    },
    async (input: ConvertInput) => {
      const obj = JSON.parse(new TextDecoder().decode(input.data));
      const pretty = JSON.stringify(obj, null, 2);
      return {
        name: `${baseNoExt(input.name)}-pretty.json`,
        type: 'application/json',
        data: new TextEncoder().encode(pretty).buffer as ArrayBuffer,
      };
    },
  );

  registry.register(
    {
      id: 'txt-csv-json',
      name: 'CSV to JSON',
      description: 'Convert a CSV table to JSON',
      category: 'text',
      from: 'csv',
      to: 'json',
      source: 'builtin',
      icon: svgIcons.text,
    },
    async (input: ConvertInput) => {
      const text = new TextDecoder().decode(input.data);
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) throw new Error('CSV file is empty');
      const header = lines[0].split(',').map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim());
        const row: Record<string, string> = {};
        header.forEach((h, i) => (row[h] = cells[i] ?? ''));
        return row;
      });
      return {
        name: `${baseNoExt(input.name)}.json`,
        type: 'application/json',
        data: new TextEncoder().encode(JSON.stringify(rows, null, 2)).buffer as ArrayBuffer,
      };
    },
  );

  registry.register(
    {
      id: 'txt-json-csv',
      name: 'JSON to CSV',
      description: 'Convert a JSON array to CSV',
      category: 'text',
      from: 'json',
      to: 'csv',
      source: 'builtin',
      icon: svgIcons.text,
    },
    async (input: ConvertInput) => {
      const data = JSON.parse(new TextDecoder().decode(input.data));
      const arr = Array.isArray(data) ? data : [data];
      if (arr.length === 0) throw new Error('JSON array is empty');
      const headers = [...new Set(arr.flatMap((r) => Object.keys(r)))];
      const esc = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(','), ...arr.map((r) => headers.map((h) => esc(r[h])).join(','))];
      return {
        name: `${baseNoExt(input.name)}.csv`,
        type: 'text/csv',
        data: new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer,
      };
    },
  );

  registry.register(
    {
      id: 'txt-base64-decode',
      name: 'Base64 Decode',
      description: 'Decode base64 text to a file',
      category: 'text',
      from: 'txt',
      to: 'bin',
      source: 'builtin',
      icon: svgIcons.text,
    },
    async (input: ConvertInput) => {
      const text = new TextDecoder().decode(input.data).trim();
      const binary = atob(text);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { name: `${baseNoExt(input.name)}.decoded`, type: 'application/octet-stream', data: bytes.buffer as ArrayBuffer };
    },
  );
}
