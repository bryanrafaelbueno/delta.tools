import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { registry } from './registry';
import { svgIconForExt, svgIcons } from '../ui/svg-icons';
import { toResult } from './helpers';

const CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

let ffmpegPromise: Promise<FFmpeg> | null = null;
let loadProgress = 0;

export function getFfmpegProgress(): number {
  return loadProgress;
}

export function getFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, 'text/javascript', true, (e) => {
          loadProgress = (e.total > 0 ? e.received / e.total : 0) * 0.8;
        }),
        wasmURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, 'application/wasm', true, (e) => {
          loadProgress = 0.8 + (e.total > 0 ? e.received / e.total : 0) * 0.2;
        }),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

interface Job {
  id: number;
  inputName: string;
  outputName: string;
  args: string[];
  data: ArrayBuffer;
  onProgress?: (p: number) => void;
}

let jobId = 0;

async function runFfmpeg(job: Job): Promise<Uint8Array> {
  const ffmpeg = await getFfmpeg();
  const onProgress = (progress: number): void => {
    job.onProgress?.(progress);
  };
  const handler = (e: { progress: number }): void => onProgress(e.progress);
  const logHandler = (e: { message: string }): void => {
    console.debug('[ffmpeg]', e.message);
  };
  ffmpeg.on('progress', handler);
  ffmpeg.on('log', logHandler);
  try {
    await ffmpeg.writeFile(job.inputName, new Uint8Array(job.data));
    await ffmpeg.exec(job.args);
    const out = await ffmpeg.readFile(job.outputName);
    await ffmpeg.deleteFile(job.inputName);
    await ffmpeg.deleteFile(job.outputName);
    return out as Uint8Array;
  } finally {
    ffmpeg.off('progress', handler);
    ffmpeg.off('log', logHandler);
  }
}

function icon(ext: string): string {
  return svgIconForExt(ext);
}

const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'];
// WebM is excluded: the ffmpeg.wasm core has no VP8 encoder, its VP9 encoder
// crashes (memory allocation error) and H.264-in-WebM is not a valid
// combination, so no WebM conversion can actually succeed.
const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'avi'];

function registerAudioConverter(from: string, to: string): void {
  registry.register(
    {
      id: `aud-${from}-${to}`,
      name: `${from.toUpperCase()} to ${to.toUpperCase()}`,
      description: `Convert ${from.toUpperCase()} audio to ${to.toUpperCase()} with ffmpeg.wasm`,
      category: 'audio',
      from,
      to,
      source: 'builtin',
      icon: icon(to),
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        id: ++jobId,
        inputName: input.name,
        outputName: `out.${to}`,
        args: ['-i', input.name, '-vn', '-acodec', codecFor(to), '-y', `out.${to}`],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: mimeFor(to) }), `${baseNoExt(input.name)}.${to}`);
    },
  );
}

function registerVideoConverter(from: string, to: string): void {
  registry.register(
    {
      id: `vid-${from}-${to}`,
      name: `${from.toUpperCase()} to ${to.toUpperCase()}`,
      description: `Convert ${from.toUpperCase()} video to ${to.toUpperCase()} with ffmpeg.wasm`,
      category: 'video',
      from,
      to,
      source: 'builtin',
      icon: icon(to),
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        id: ++jobId,
        inputName: input.name,
        outputName: `out.${to}`,
        args: ['-i', input.name, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', `out.${to}`],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: mimeFor(to) }), `${baseNoExt(input.name)}.${to}`);
    },
  );
}

function registerVideoToAudio(from: string): void {
  registry.register(
    {
      id: `vid-${from}-mp3`,
      name: `${from.toUpperCase()} to MP3`,
      description: `Extract audio from ${from.toUpperCase()} as MP3`,
      category: 'audio',
      from,
      to: 'mp3',
      source: 'builtin',
      icon: svgIcons.audio,
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        id: ++jobId,
        inputName: input.name,
        outputName: 'out.mp3',
        args: ['-i', input.name, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', 'out.mp3'],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: 'audio/mpeg' }), `${baseNoExt(input.name)}.mp3`);
    },
  );
}

function registerVideoToGif(from: string): void {
  registry.register(
    {
      id: `vid-${from}-gif`,
      name: `${from.toUpperCase()} to GIF`,
      description: `Convert ${from.toUpperCase()} video to animated GIF`,
      category: 'video',
      from,
      to: 'gif',
      source: 'builtin',
      icon: svgIcons.video,
    },
    async (input, onProgress) => {
      const out = await runFfmpeg({
        id: ++jobId,
        inputName: input.name,
        outputName: 'out.gif',
        args: ['-i', input.name, '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-y', 'out.gif'],
        data: input.data,
        onProgress,
      });
      return toResult(new Blob([out as BlobPart], { type: 'image/gif' }), `${baseNoExt(input.name)}.gif`);
    },
  );
}

function codecFor(to: string): string {
  switch (to) {
    case 'mp3':
      return 'libmp3lame';
    case 'wav':
      return 'pcm_s16le';
    case 'ogg':
      return 'libvorbis';
    case 'flac':
      return 'flac';
    case 'aac':
    case 'm4a':
      return 'aac';
    case 'opus':
      return 'libopus';
    default:
      return 'libmp3lame';
  }
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    opus: 'audio/opus',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    gif: 'image/gif',
  };
  return map[ext] ?? 'application/octet-stream';
}

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerMediaConverters(): void {
  for (const from of AUDIO_EXTS) {
    for (const to of AUDIO_EXTS) {
      if (from === to) continue;
      registerAudioConverter(from, to);
    }
  }
  for (const from of VIDEO_EXTS) {
    for (const to of VIDEO_EXTS) {
      if (from === to) continue;
      registerVideoConverter(from, to);
    }
  }
  for (const from of VIDEO_EXTS) {
    registerVideoToAudio(from);
    registerVideoToGif(from);
  }
}
