import { registry } from './registry';
import { toResult } from './helpers';
import { runFfmpeg } from './media';
import { svgIconForExt } from '../ui/svg-icons';

// Repair old files for modern players.
//
// Old audio/video files (legacy codecs, odd containers, broken moov atoms)
// often fail to play in modern browsers and players. These converters re-encode
// them to widely-compatible codecs (H.264/AAC in MP4, MP3 audio) using the
// same serialized ffmpeg.wasm pipeline as the regular media converters.

const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'avi'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'];

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function registerVideoRepair(from: string): void {
  registry.register(
    {
      id: `repair-vid-${from}`,
      name: `Repair ${from.toUpperCase()} for modern players`,
      description: `Re-encode old ${from.toUpperCase()} video to H.264/AAC MP4 so it plays on any new device`,
      category: 'video',
      from,
      to: 'mp4',
      source: 'builtin',
      icon: svgIconForExt('mp4'),
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        inputName: input.name,
        outputName: 'out.mp4',
        kind: 'video',
        // Always re-encode: stream-copying keeps the broken/legacy stream
        // intact, which defeats the purpose of a repair. faststart moves the
        // moov atom to the front so the file starts playing immediately.
        attempts: [
          [
            '-i', input.name,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y', 'out.mp4',
          ],
        ],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: 'video/mp4' }), `${baseNoExt(input.name)}.mp4`);
    },
  );
}

function registerAudioRepair(from: string): void {
  registry.register(
    {
      id: `repair-aud-${from}`,
      name: `Repair ${from.toUpperCase()} for modern players`,
      description: `Re-encode old ${from.toUpperCase()} audio to MP3 so it plays on any new device`,
      category: 'audio',
      from,
      to: 'mp3',
      source: 'builtin',
      icon: svgIconForExt('mp3'),
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        inputName: input.name,
        outputName: 'out.mp3',
        kind: 'audio',
        attempts: [['-i', input.name, '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-y', 'out.mp3']],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: 'audio/mpeg' }), `${baseNoExt(input.name)}.mp3`);
    },
  );
}

export function registerRepairConverters(): void {
  for (const from of VIDEO_EXTS) registerVideoRepair(from);
  for (const from of AUDIO_EXTS) registerAudioRepair(from);
}
