import { registry } from './registry';
import { svgIconForExt } from '../ui/svg-icons';
import { toResult } from './helpers';
import { loadBitmap, canvasToBlob } from './image';
import type { ConvertInput } from '../types';

// Real-world HEIC files (iPhone photos) are meta/item-based containers. The
// canvas path can't decode them outside Safari, and even ffmpeg.wasm's core
// (FFmpeg 5.1) rejects them — its mov demuxer requires a moov track, which
// iPhone HEIC files don't have. libheif-wasm (bundled inside heic2any, loaded
// lazily on first use) is the only in-browser decoder that handles the actual
// files; heic2any decodes to raw RGBA in wasm and encodes the target format
// through a canvas. It only advertises PNG/JPEG/GIF output, so WEBP goes
// through an extra canvas re-encode (same path the canvas image tools use).

const HEIC_TARGETS: { to: string; mime: string; quality?: number }[] = [
  { to: 'png', mime: 'image/png' },
  { to: 'jpg', mime: 'image/jpeg', quality: 0.92 },
  { to: 'webp', mime: 'image/webp' },
];

async function decodeHeic(input: ConvertInput, toType: string, quality?: number): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({
    blob: new Blob([input.data], { type: 'image/heic' }),
    toType,
    ...(quality !== undefined ? { quality } : {}),
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) throw new Error('HEIC decoding failed: libheif returned no output');
  if (blob.type && blob.type !== toType) {
    throw new Error(`HEIC decoding failed: browser encoded ${blob.type} instead of ${toType}`);
  }
  return blob;
}

function registerHeicConverter(target: { to: string; mime: string; quality?: number }): void {
  const { to, mime, quality } = target;
  registry.register(
    {
      id: `img-heic-${to}`,
      name: `HEIC to ${to.toUpperCase()}`,
      description: `Convert HEIC (iPhone photo) to ${to.toUpperCase()} with libheif.wasm`,
      category: 'image',
      from: 'heic',
      to,
      source: 'builtin',
      icon: svgIconForExt(to),
    },
    async (input: ConvertInput) => {
      // heic2any has no WEBP output — decode to PNG and re-encode through a
      // canvas, mirroring how the other image converters produce WEBP.
      const source = to === 'webp' ? await decodeHeic(input, 'image/png') : await decodeHeic(input, mime, quality);
      let blob: Blob = source;
      if (to === 'webp') {
        const bitmap = await loadBitmap({ ...input, data: await source.arrayBuffer(), type: 'image/png' });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        blob = await canvasToBlob(canvas, mime);
        canvas.width = 0;
        canvas.height = 0;
      }
      return toResult(blob, `${baseNoExt(input.name)}.${to}`);
    },
  );
}

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerHeicConverters(): void {
  for (const target of HEIC_TARGETS) {
    registerHeicConverter(target);
  }
}
