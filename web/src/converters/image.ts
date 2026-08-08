import { registry } from './registry';
import { toResult } from './helpers';
import type { ConvertInput } from '../types';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  gif: 'image/gif',
};

export async function loadBitmap(input: ConvertInput): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([input.data], { type: input.type }));
}

export async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error(`Encoding to ${mime} failed`));
        // Some browsers silently fall back to PNG for unsupported mimes.
        if (b.type && b.type !== mime && !(mime === 'image/jpeg' && b.type === 'image/jpg')) {
          return reject(new Error(`Encoding to ${mime} failed (browser returned ${b.type})`));
        }
        resolve(b);
      },
      mime,
      quality,
    );
  });
}

import { svgIconForExt } from '../ui/svg-icons';

function icon(ext: string): string {
  return svgIconForExt(ext);
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'ico', 'avif', 'gif'];
const DECODABLE = [...IMAGE_EXTS];
// canvas.toBlob only actually encodes these; for bmp/ico/avif/gif it silently
// returns a PNG (or null), so we must not advertise them as encodable.
const ENCODABLE = ['png', 'jpg', 'jpeg', 'webp'];

function registerImageConverter(from: string, to: string): void {
  registry.register(
    {
      id: `img-${from}-${to}`,
      name: `${from.toUpperCase()} to ${to.toUpperCase()}`,
      description: `Convert ${from.toUpperCase()} to ${to.toUpperCase()} right in your browser`,
      category: 'image',
      from,
      to,
      source: 'builtin',
      icon: icon(to),
    },
    async (input) => {
      const bitmap = await loadBitmap(input);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const mime = MIME[to];
      const blob = await canvasToBlob(canvas, mime, to === 'jpg' || to === 'jpeg' ? 0.92 : undefined);
      canvas.width = 0;
      canvas.height = 0;
      return toResult(blob, `${baseNoExt(input.name)}.${to}`);
    },
  );
}

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerImageConverters(): void {
  for (const from of DECODABLE) {
    for (const to of ENCODABLE) {
      if (from === to || (from === 'jpg' && to === 'jpeg') || (from === 'jpeg' && to === 'jpg')) continue;
      registerImageConverter(from, to);
    }
  }
}
