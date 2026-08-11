import { registry } from '../converters/registry';
import { formatBytes } from '../converters/helpers';
import { extOf, baseName, CATEGORIES } from '../types';
import { download } from '../converters/helpers';
import { bindToolCards, toolCard } from './dashboard';
import { getFfmpegProgress } from '../converters/media';
import { toast } from '../ui/toast';
import { state } from '../state';
import { api } from '../api';
import { icon } from '../ui/icons';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';
import {
  assertFileFitsMemory,
  estimatePeakBytes,
  isLowMemoryDevice,
  memoryLimitBytes,
  formatMemoryLimit,
  type MemoryKind,
} from '../converters/memory';

interface JobState {
  name: string;
  size: number;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  error?: string;
}

function memoryKindFor(def: { category: string; id: string }): MemoryKind {
  if (def.id.startsWith('repair-')) return def.id.startsWith('repair-vid') ? 'video' : 'audio';
  switch (def.category) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'document':
      return 'document';
    case 'text':
      return 'text';
    case 'archive':
      return 'archive';
    default:
      return 'other';
  }
}

export function renderTool(id: string): HTMLElement {
  const conv = registry.get(id);
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  if (!conv) {
    el.innerHTML = `<div class="page-title">Tool not found</div><div class="page-sub">This tool does not exist.</div>`;
    return el;
  }

  const { def } = conv;
  const converter = conv;
  const isMulti = def.to === 'pdf-merge';
  const TEXT_INPUTS = new Set(['txt', 'md', 'csv', 'json', 'html']);
  const acceptsText = TEXT_INPUTS.has(def.from);
  const jobs = new Map<string, JobState>();
  const results = new Map<string, { name: string; type: string; data: ArrayBuffer }>();
  const kind = memoryKindFor(def);
  const lowMemory = isLowMemoryDevice();
  const memoryLimit = memoryLimitBytes();
  // Retained input+result bytes on this page; we count it so a stream of
  // conversions cannot silently exceed the mobile memory budget.
  let retainedBytes = 0;

  const sizeHint = lowMemory
    ? `max ~${formatBytes(Math.floor(memoryLimit / estimatePeakBytes(1, kind)))} per ${def.from.toUpperCase()} · `
    : '';

  el.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:inline-flex;align-items:center;gap:8px" class="page-title"><span>${renderIcon(def.icon, def.iconColor, 22)}</span> ${def.name}</div>
        <button class="icon-btn fav-toggle ${state.isFavorite(def.id) ? 'fav-on' : ''}" id="fav-toggle" title="${state.isFavorite(def.id) ? 'Remove from favorites' : 'Add to favorites'}">${icon('star')}</button>
      </div>
      <div class="page-sub">${def.description} — 100% client-side</div>
    </div>
    <div class="panel">
      <div class="dropzone" id="dropzone">
        <div class="dz-icon">${renderIcon(def.icon, def.iconColor, 30)}</div>
        <div class="dz-title">Drop your ${def.from.toUpperCase()} ${isMulti ? 'files' : 'file'} here</div>
        <div class="dz-sub">${sizeHint}or click to browse · max ${isMulti ? '10' : '1'} ${def.from.toUpperCase()}</div>
        <input type="file" id="file-input" ${isMulti ? 'multiple' : ''} accept=".${def.from},${acceptType(def.from)}" />
      </div>
      ${lowMemory ? `<div class="mem-note">📱 Low-memory mode: conversions are capped at ${formatMemoryLimit(memoryLimit)} per page so your device stays responsive.</div>` : ''}
      ${acceptsText ? `
      <div class="text-input-wrap">
        <div class="text-input-divider">or paste ${def.from === 'txt' ? 'text / a URL' : def.from.toUpperCase()} below</div>
        <textarea id="text-input" rows="4" spellcheck="false" placeholder="${def.from === 'txt' ? 'Paste any text or a download URL here…' : `Paste ${def.from.toUpperCase()} content here…`}"></textarea>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <button class="btn btn-primary" id="text-submit" type="button" style="padding:8px 16px">Use text</button>
          <span style="font-size:12px;color:var(--text-muted)">Treated as a ${def.from.toUpperCase()} file</span>
        </div>
      </div>` : ''}
    </div>
    <div class="panel" id="queue-panel" style="display:none">
      <div class="page-title" style="font-size:15px">Conversion queue</div>
      <div style="height:10px"></div>
      <div id="queue"></div>
    </div>
    <div class="panel" style="display:none" id="result-panel">
      <div class="page-title" style="font-size:15px">Results</div>
      <div style="height:10px"></div>
      <div id="results"></div>
    </div>
  `;

  hydrateSvgIconsAsync(el);
  const dz = el.querySelector('#dropzone') as HTMLElement;
  const input = el.querySelector('#file-input') as HTMLInputElement;

  const favBtn = el.querySelector('#fav-toggle') as HTMLButtonElement | null;
  favBtn?.addEventListener('click', async () => {
    if (!state.token) {
      toast('Sign in to save favorites', 'error');
      window.location.hash = '/auth';
      return;
    }
    const isFav = state.isFavorite(def.id);
    try {
      if (isFav) {
        await api.removeFavorite(def.id);
        state.setFavorites(state.favorites.filter((id) => id !== def.id));
      } else {
        await api.addFavorite(def.id);
        state.setFavorites([...state.favorites, def.id]);
      }
      favBtn.classList.toggle('fav-on', !isFav);
      favBtn.title = isFav ? 'Add to favorites' : 'Remove from favorites';
      toast(isFav ? 'Removed from favorites' : 'Added to favorites', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update favorite', 'error');
    }
  });

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    handleFiles([...e.dataTransfer!.files]);
  });
  input.addEventListener('change', () => handleFiles([...input.files!]));

  if (acceptsText) {
    const textArea = el.querySelector('#text-input') as HTMLTextAreaElement;
    const textSubmit = el.querySelector('#text-submit') as HTMLButtonElement;
    const submitText = (): void => {
      const text = textArea.value.trim();
      if (!text) {
        toast('Paste some text first', 'error');
        return;
      }
      const file = new File([text], `paste.${def.from}`, { type: acceptType(def.from) });
      textArea.value = '';
      handleFiles([file]);
    };
    textSubmit.addEventListener('click', submitText);
    textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitText();
    });
  }

  async function handleFiles(files: File[]): Promise<void> {
    const queuePanel = el.querySelector('#queue-panel') as HTMLElement;
    const queue = el.querySelector('#queue') as HTMLElement;
    queuePanel.style.display = 'block';

    if (isMulti && files.length > 1) {
      await runMerge(files);
      return;
    }

    const file = files[0];
    if (!file) return;
    if (extOf(file.name) !== def.from && !(def.from === 'jpeg' && extOf(file.name) === 'jpg')) {
      toast(`Expected .${def.from} but got .${extOf(file.name)}`, 'error');
      return;
    }
    if (jobs.has(file.name)) return;

    // Memory budget: refuse single files whose estimated peak would blow the
    // page limit, and refuse adding more work when the page already retains
    // too much converted data (low-memory devices only).
    try {
      assertFileFitsMemory(file.size, kind);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      return;
    }
    if (lowMemory && memoryLimit !== Infinity) {
      const wouldRetain = retainedBytes + estimatePeakBytes(file.size, kind);
      if (wouldRetain > memoryLimit) {
        toast(
          `Memory limit reached (~${formatMemoryLimit(memoryLimit)} in use). Clear finished conversions or reload the page before converting more.`,
          'error',
        );
        return;
      }
    }
    retainedBytes += file.size;

    const job: JobState = { name: file.name, size: file.size, status: 'pending', progress: 0 };
    jobs.set(file.name, job);
    queue.appendChild(jobRow(job, def.id));
    await runJob(job, file);
  }

  function jobRow(job: JobState, toolId: string): HTMLElement {
    void toolId;
    const row = document.createElement('div');
    row.className = 'converter-row';
    row.dataset.job = job.name;
    row.innerHTML = `
      <div class="file-info">
        <div class="file-name">${escapeHtml(job.name)}</div>
        <div class="file-size">${formatBytes(job.size)}</div>
      </div>
      <span class="arrow-icon">→</span>
      <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
      <button class="btn btn-ghost" data-action="download" style="display:none;padding:6px 12px">Download</button>
      <button class="btn btn-danger" data-action="clear" style="padding:6px 12px">Clear</button>
    `;
    row.querySelector('[data-action="clear"]')!.addEventListener('click', () => {
      retainedBytes = Math.max(0, retainedBytes - (results.get(job.name)?.data.byteLength ?? job.size));
      jobs.delete(job.name);
      row.remove();
    });
    row.querySelector('[data-action="download"]')!.addEventListener('click', () => {
      const result = results.get(job.name);
      if (result) download(result.data, result.name);
    });
    return row;
  }

  async function runJob(job: JobState, file: File): Promise<void> {
    job.status = 'running';
    updateRow(job, def.id);
    try {
      const result = await converter.run(
        { name: file.name, ext: extOf(file.name), type: file.type, data: await file.arrayBuffer() },
        (p) => {
          job.progress = p;
          updateRow(job, def.id);
        },
      );
      job.status = 'done';
      job.progress = 1;
      results.set(job.name, result);
      retainedBytes += result.data.byteLength;
      updateRow(job, def.id);
      showResult(result);
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      updateRow(job, def.id);
      toast(`Conversion failed: ${job.error}`, 'error');
    }
  }

  function updateRow(job: JobState, toolId: string): void {
    const row = el.querySelector(`[data-job="${CSS.escape(job.name)}"]`) as HTMLElement | null;
    if (!row) return;
    const fill = row.querySelector('.progress-fill') as HTMLElement;
    const dlBtn = row.querySelector('[data-action="download"]') as HTMLElement;
    const clearBtn = row.querySelector('[data-action="clear"]') as HTMLElement;
    if (job.status === 'running') {
      fill.style.width = `${(job.progress || 0) * 100}%`;
      if (toolId.startsWith('aud-') || toolId.startsWith('vid-')) {
        const loaded = getFfmpegProgress();
        if (loaded > 0 && loaded < 1) {
          fill.style.width = `${loaded * 60}%`;
        }
      }
    } else if (job.status === 'done') {
      fill.style.width = '100%';
      fill.style.background = 'var(--success)';
      dlBtn.style.display = 'inline-flex';
      clearBtn.style.display = 'none';
    } else {
      fill.style.width = '100%';
      fill.style.background = 'var(--danger)';
      clearBtn.style.display = 'inline-flex';
    }
  }

  async function runMerge(files: File[]): Promise<void> {
    const { PDFDocument } = await import('pdf-lib');
    const queue = el.querySelector('#queue') as HTMLElement;
    const merged = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const row = jobRow(
        { name: files[i].name, size: files[i].size, status: 'running', progress: 0 },
        def.id,
      );
      queue.appendChild(row);
      try {
        const doc = await PDFDocument.load(await files[i].arrayBuffer());
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      } catch {
        toast(`Could not read ${files[i].name}`, 'error');
      }
      row.remove();
    }
    const bytes = await merged.save();
    const result = {
      name: `merged-${baseName(files[0].name)}-and-${files.length - 1}-more.pdf`,
      type: 'application/pdf',
      data: bytes.buffer as ArrayBuffer,
    };
    retainedBytes += result.data.byteLength;
    results.set(result.name, result);
    showResult(result);
    const resultPanel = el.querySelector('#result-panel') as HTMLElement;
    resultPanel.style.display = 'block';
  }

  function showResult(result: { name: string; type: string; data: ArrayBuffer }): void {
    const resultPanel = el.querySelector('#result-panel') as HTMLElement;
    resultPanel.style.display = 'block';
    const wrap = el.querySelector('#results') as HTMLElement;
    const row = document.createElement('div');
    row.className = 'converter-row';
    row.innerHTML = `
      <div class="file-info">
        <div class="file-name">${escapeHtml(result.name)}</div>
        <div class="file-size">${formatBytes(result.data.byteLength)}</div>
      </div>
      <span class="arrow-icon">&#10003;</span>
      <button class="btn btn-primary" data-action="download-result" style="margin-left:auto">Download</button>
    `;
    row.querySelector('[data-action="download-result"]')!.addEventListener('click', () => {
      download(result.data, result.name);
    });
    wrap.prepend(row);
    const ext = result.name.split('.').pop()?.toLowerCase() ?? '';
    if (TEXT_OUTPUTS.has(ext)) showResultText(result);
  }

  const TEXT_OUTPUTS = new Set(['txt', 'md', 'csv', 'json', 'html']);

  function showResultText(result: { name: string; type: string; data: ArrayBuffer }): void {
    const wrap = el.querySelector('#results') as HTMLElement;
    const panel = document.createElement('div');
    panel.className = 'result-text-panel';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div class="file-name" style="font-size:13px">Text output</div>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" data-action="copy-text" style="padding:5px 12px;font-size:12px">Copy</button>
      </div>
      <textarea readonly rows="8" spellcheck="false"></textarea>
    `;
    const ta = panel.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = new TextDecoder().decode(result.data);
    panel.querySelector('[data-action="copy-text"]')!.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        toast('Copied to clipboard', 'success');
      } catch {
        ta.select();
        document.execCommand('copy');
        toast('Copied to clipboard', 'success');
      }
    });
    wrap.prepend(panel);
  }

  // suggestions
  const related = registry
    .all()
    .filter((c) => c.def.category === def.category && c.def.id !== def.id)
    .slice(0, 8);
  if (related.length) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="page-title" style="font-size:15px">More ${CATEGORIES[def.category].label} tools</div><div style="height:12px"></div><div class="tool-grid"></div>`;
    const grid = panel.querySelector('.tool-grid')!;
    grid.innerHTML = related.map((c) => toolCard(c.def)).join('');
    bindToolCards(panel);
    hydrateSvgIconsAsync(panel);
    el.appendChild(panel);
  }

  return el;
}

function acceptType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    avif: 'image/avif',
    gif: 'image/gif',
    heic: 'image/heic',
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
    pdf: 'application/pdf',
    json: 'application/json',
    csv: 'text/csv',
    txt: 'text/plain',
    gz: 'application/gzip',
    zip: 'application/zip',
    tar: 'application/x-tar',
  };
  return map[ext] ?? 'application/octet-stream';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
