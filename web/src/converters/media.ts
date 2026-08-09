import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { registry } from './registry';
import { svgIconForExt, svgIcons } from '../ui/svg-icons';
import { toResult } from './helpers';
import { assertFileFitsMemory, type MemoryKind } from './memory';

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
  inputName: string;
  outputName: string;
  attempts: string[][];
  data: ArrayBuffer;
  kind?: MemoryKind;
  onProgress?: (p: number) => void;
}

// The FFmpeg instance is a singleton backed by a single web worker with an
// in-memory filesystem. Running two conversions at the same time corrupts the
// worker's MEMFS (one job's writeFile/deleteFile breaks the other's files),
// which surfaces as the cryptic "ErrnoError: FS error". Serialize every job.
let jobChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = jobChain.then(fn, fn);
  jobChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// Long-lived workers also rot: after ~60-70 sequential execs the ffmpeg.wasm
// heap deterministically corrupts ("memory access out of bounds") in some
// environments. Recycle the worker every 40 execs so long sessions (e.g.
// repairing a batch of old files) never hit the crash point. The reset happens
// inside the serialized job chain, so the next conversion transparently spins
// up a fresh instance.
let execCount = 0;
const RESET_AFTER_EXECS = 40;

async function resetFfmpegWorker(): Promise<void> {
  const f = await ffmpegPromise?.catch(() => null);
  if (f) {
    try {
      f.terminate();
    } catch {
      // worker already dead — nothing to clean up
    }
  }
  ffmpegPromise = null;
  loadProgress = 0;
}

async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path);
  } catch {
    // The file may not exist (failed exec, crashed job); nothing to clean up.
  }
}

function describeFailure(logs: string[]): string {
  const relevant = [...new Set(logs.filter((l) => /error|failed|invalid|not supported|no such file/i.test(l)))].slice(-3).join(' | ');
  if (relevant) return relevant;
  const last = logs[logs.length - 1];
  return last || 'no ffmpeg output';
}

function friendlyError(detail: string, logs: string[]): Error {
  const trace = `${detail} ${logs.join(' ')}`;
  // AV1 cannot be decoded by the ffmpeg.wasm core (no dav1d/libaom) and the
  // MOV muxer rejects AV1 stream copies, so MP4(AV1)→MOV can never succeed.
  // The file is NOT corrupt — this is a codec limitation.
  if (/av1/i.test(trace) && /sequence header|pixel format|codec parameters|hardware|av1 only supported/i.test(trace)) {
    return new Error(
      'This video uses the AV1 codec, which the in-browser conversion engine cannot decode, so it cannot be re-encoded to MOV. Try MP4 → MKV instead — it converts the same file without re-encoding (stream copy).',
    );
  }
  if (/invalid data found when processing input|moov atom not found|does not look like/i.test(trace)) {
    return new Error(
      'Your file could not be read by the converter. It is likely corrupt or an incomplete download — check that it plays in a video player, then download it again.',
    );
  }
  if (/ErrnoError|FS error|out of memory/i.test(detail) && logs.length) {
    return new Error(`${detail} | ffmpeg: ${describeFailure(logs)}`);
  }
  return new Error(detail);
}

export async function runFfmpeg(job: Job): Promise<Uint8Array> {
  // On low-memory devices (mobile), refuse jobs whose estimated peak memory
  // would exceed the 1024 MB page budget instead of crashing the tab.
  assertFileFitsMemory(job.data.byteLength, job.kind ?? 'video');
  return enqueue(async () => {
    const ffmpeg = await getFfmpeg();
    const onProgress = (progress: number): void => {
      job.onProgress?.(progress);
    };
    const handler = (e: { progress: number }): void => onProgress(e.progress);
    const logs: string[] = [];
    const logHandler = (e: { message: string }): void => {
      logs.push(e.message);
      if (logs.length > 200) logs.shift();
      console.debug('[ffmpeg]', e.message);
    };
    ffmpeg.on('progress', handler);
    ffmpeg.on('log', logHandler);
    try {
      await ffmpeg.writeFile(job.inputName, new Uint8Array(job.data));
      let done = false;
      for (const attempt of job.attempts) {
        const ret = await ffmpeg.exec(attempt);
        if (ret === 0) {
          done = true;
          break;
        }
        if (job.attempts.length > 1) {
          // The muxer rejected the stream copy (e.g. unsupported codec for
          // the target container); try the next attempt.
          console.debug('[ffmpeg] attempt failed, retrying:', attempt.join(' '));
        }
      }
      if (!done) {
        throw new Error(`ffmpeg exited with an error: ${describeFailure(logs)}`);
      }
      const out = await ffmpeg.readFile(job.outputName);
      await safeDelete(ffmpeg, job.inputName);
      await safeDelete(ffmpeg, job.outputName);
      return out as Uint8Array;
    } catch (err) {
      await safeDelete(ffmpeg, job.inputName);
      await safeDelete(ffmpeg, job.outputName);
      const detail = err instanceof Error ? err.message : String(err);
      throw friendlyError(detail, logs);
    } finally {
      ffmpeg.off('progress', handler);
      ffmpeg.off('log', logHandler);
      execCount++;
      if (execCount >= RESET_AFTER_EXECS) {
        execCount = 0;
        await resetFfmpegWorker();
      }
    }
  });
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
        kind: 'audio',
        inputName: input.name,
        outputName: `out.${to}`,
        attempts: [['-i', input.name, '-vn', '-acodec', codecFor(to), '-y', `out.${to}`]],
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
        kind: 'video',
        inputName: input.name,
        outputName: `out.${to}`,
        // MP4/MOV/MKV/AVI all share the same H.264+AAC codecs, so a container
        // change is a pure remux. Stream copy first: it is ~10-50x faster and
        // uses far less wasm heap (re-encoding large files blows up the MEMFS
        // and fails with "ErrnoError: FS error"). Fall back to re-encoding
        // when the target muxer rejects the stream (e.g. unsupported codec).
        attempts: [
          ['-i', input.name, '-map', '0', '-c', 'copy', '-y', `out.${to}`],
          ['-i', input.name, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', `out.${to}`],
        ],
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
        kind: 'audio',
        inputName: input.name,
        outputName: 'out.mp3',
        attempts: [['-i', input.name, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', 'out.mp3']],
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
        kind: 'video',
        inputName: input.name,
        outputName: 'out.gif',
        attempts: [['-i', input.name, '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-y', 'out.gif']],
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
