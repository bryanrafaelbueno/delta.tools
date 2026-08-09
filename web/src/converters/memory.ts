// Memory guard for low-RAM devices.
//
// The heaviest consumers in Delta.tools are ffmpeg.wasm (WASM heap + in-memory
// filesystem) and decoded media held as ArrayBuffers. On mobile / low-memory
// devices we cap the estimated peak memory of a conversion at 1 GiB (1024 MB)
// per page — larger jobs are refused up-front with a friendly message instead
// of crashing the tab.

export const PAGE_MEMORY_LIMIT = 1024 * 1024 * 1024; // 1 GiB

export type MemoryKind = 'audio' | 'video' | 'image' | 'document' | 'text' | 'archive' | 'other';

export function isMobile(): boolean {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    ((navigator.maxTouchPoints ?? 0) > 1 && window.innerWidth < 1024)
  );
}

export function deviceMemoryMB(): number | undefined {
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === 'number' ? dm : undefined;
}

/** True on phones/tablets and on devices that report 4 GB or less of RAM. */
export function isLowMemoryDevice(): boolean {
  const dm = deviceMemoryMB();
  if (dm !== undefined && dm <= 4) return true;
  return isMobile();
}

/** The per-page memory budget in bytes (Infinity on unrestricted devices). */
export function memoryLimitBytes(): number {
  return isLowMemoryDevice() ? PAGE_MEMORY_LIMIT : Infinity;
}

// Rough peak-memory estimate for a single conversion. ffmpeg keeps the input,
// the decoded stream and the output alive in the WASM heap at the same time;
// video re-encoding is by far the heaviest, audio is cheap.
export function estimatePeakBytes(size: number, kind: MemoryKind): number {
  switch (kind) {
    case 'video':
      return size * 8;
    case 'audio':
      return size * 4;
    case 'image':
      return size * 6; // decode to RGBA + canvas + re-encode
    case 'document':
      return size * 3;
    default:
      return size * 2;
  }
}

export function formatMemoryLimit(limit: number): string {
  return `${Math.round(limit / (1024 * 1024))} MB`;
}

/**
 * Throws when `size` would push the estimated peak above the page budget on
 * low-memory devices. No-op on unrestricted (desktop) devices.
 */
export function assertFileFitsMemory(size: number, kind: MemoryKind): void {
  const limit = memoryLimitBytes();
  if (limit === Infinity) return;
  const peak = estimatePeakBytes(size, kind);
  if (peak > limit) {
    throw new Error(
      `This file is too large for your device's memory. ` +
        `Delta.tools keeps a ${formatMemoryLimit(limit)} limit per page on mobile ` +
        `(this file would need ~${formatMemoryLimit(peak)} while converting). ` +
        `Try a smaller file, or run it on a computer.`,
    );
  }
}
