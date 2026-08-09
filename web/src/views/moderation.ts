import { api } from '../api';
import { state } from '../state';
import { toast } from '../ui/toast';
import { convertWithPlugin } from '../plugins/manager';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';
import { svgIcons } from '../ui/svg-icons';
import { extOf } from '../types';
import type { MarketplacePlugin, ConvertInput } from '../types';

export function renderModeration(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  if (!state.token || state.user?.role !== 'Developer') {
    el.innerHTML = `
      <div class="page-title">Moderation</div>
      <div class="page-sub">This area is reserved for marketplace moderators.</div>
    `;
    return el;
  }

  el.innerHTML = `
    <div>
      <div class="page-title">Moderation</div>
      <div class="page-sub">Review plugins before they reach the marketplace. New plugins and every update wait for approval.</div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
        <button class="btn btn-ghost" id="mod-all">All</button>
        <button class="btn btn-ghost" id="mod-pending" class="active">Pending</button>
        <button class="btn btn-ghost" id="mod-approved">Approved</button>
        <button class="btn btn-ghost" id="mod-rejected">Rejected</button>
      </div>
      <div id="mod-list"><div class="empty">Loading…</div></div>
    </div>
  `;

  const list = el.querySelector('#mod-list') as HTMLElement;
  let filter: string = 'pending';
  let plugins: MarketplacePlugin[] = [];

  const buttons: Record<string, HTMLButtonElement> = {
    all: el.querySelector('#mod-all') as HTMLButtonElement,
    pending: el.querySelector('#mod-pending') as HTMLButtonElement,
    approved: el.querySelector('#mod-approved') as HTMLButtonElement,
    rejected: el.querySelector('#mod-rejected') as HTMLButtonElement,
  };
  for (const [key, btn] of Object.entries(buttons)) {
    btn.classList.toggle('active', key === filter);
    btn.addEventListener('click', () => {
      filter = key;
      for (const [k, b] of Object.entries(buttons)) b.classList.toggle('active', k === filter);
      render();
    });
  }

  function render(): void {
    const shown = plugins.filter((p) => filter === 'all' || p.status === filter);
    if (shown.length === 0) {
      list.innerHTML = `<div class="empty">Nothing here.</div>`;
      return;
    }
    list.innerHTML = shown.map(pluginBlock).join('');
    hydrateSvgIconsAsync(list);
    for (const p of shown) updateInputLabel(list, p.id);
    list.querySelectorAll('[data-mod-code]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mod-code')!;
        const p = plugins.find((x) => x.id === id)!;
        codeModal(p);
      });
    });
    list.querySelectorAll('[data-mod-test]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-mod-test')!;
        const p = plugins.find((x) => x.id === id)!;
        await runTest(p, btn as HTMLButtonElement);
      });
    });
    list.querySelectorAll('[data-mod-upload]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mod-upload')!;
        const input = list.querySelector(`[data-mod-file="${CSS.escape(id)}"]`) as HTMLInputElement | null;
        input?.click();
      });
    });
    list.querySelectorAll('[data-mod-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.getAttribute('data-mod-file')!;
        const file = (input as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          customInputs.set(id, { name: file.name, ext: extOf(file.name), type: file.type, data: await file.arrayBuffer() });
          updateInputLabel(list, id);
          toast(`Custom test input set: ${file.name}`, 'success');
        } catch {
          toast('Could not read that file', 'error');
        }
      });
    });
    list.querySelectorAll('[data-mod-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mod-clear')!;
        customInputs.delete(id);
        updateInputLabel(list, id);
      });
    });
    list.querySelectorAll('[data-mod-approve]').forEach((btn) => {
      btn.addEventListener('click', () => review(btn.getAttribute('data-mod-approve')!, 'approve'));
    });
    list.querySelectorAll('[data-mod-reject]').forEach((btn) => {
      btn.addEventListener('click', () => review(btn.getAttribute('data-mod-reject')!, 'reject'));
    });
  }

  async function review(id: string, action: 'approve' | 'reject'): Promise<void> {
    try {
      await api.reviewPlugin(id, action);
      toast(action === 'approve' ? 'Plugin approved' : 'Plugin rejected', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Review failed', 'error');
    }
  }

  async function load(): Promise<void> {
    try {
      const res = await api.listAdminPlugins();
      plugins = res.plugins as MarketplacePlugin[];
      render();
    } catch (err) {
      list.innerHTML = `<div class="empty">${err instanceof Error ? err.message : 'Could not load plugins'}</div>`;
    }
  }

  load();
  return el;
}

function statusBadge(status: string): string {
  const cls = status === 'approved' ? 'badge-ok' : status === 'rejected' ? 'badge-bad' : 'badge-warn';
  return `<span class="badge ${cls}">${status}</span>`;
}

// Files the moderator picked to test each plugin with, keyed by plugin id.
// When set, "Run test" uses the custom file instead of the synthetic sample.
const customInputs = new Map<string, ConvertInput>();

function updateInputLabel(root: HTMLElement, id: string): void {
  const label = root.querySelector(`[data-mod-input="${CSS.escape(id)}"]`) as HTMLElement | null;
  const clear = root.querySelector(`[data-mod-clear="${CSS.escape(id)}"]`) as HTMLElement | null;
  if (!label) return;
  const input = customInputs.get(id);
  label.textContent = input ? `custom input: ${input.name}` : '';
  label.style.display = input ? '' : 'none';
  if (clear) clear.style.display = input ? '' : 'none';
}

function pluginBlock(p: MarketplacePlugin): string {
  return `
    <div class="mod-plugin" data-id="${p.id}">
      <div class="head">
        <div class="picon">${renderIcon(p.icon || svgIcons.plugin, p.iconColor, 22)}</div>
        <div style="flex:1;min-width:0">
          <div class="pname">${p.name} <span style="color:var(--text-muted);font-weight:400;font-size:12px">v${p.version}</span></div>
          <div class="pauthor">by ${p.author} · ${p.inputs.map((i) => i.toUpperCase()).join(', ')} → ${p.outputs.map((o) => o.toUpperCase()).join(', ')}</div>
        </div>
        ${statusBadge(p.status)}
      </div>
      <div class="pdesc">${p.description}</div>
      <div class="mod-actions">
        <button class="btn btn-ghost" data-mod-code="${p.id}" style="padding:5px 12px;font-size:12px">View code</button>
        <button class="btn btn-ghost" data-mod-upload="${p.id}" style="padding:5px 12px;font-size:12px">Upload input</button>
        <input type="file" hidden data-mod-file="${p.id}" accept=".${p.inputs[0] ?? ''},${mimeFor(p.inputs[0] ?? 'txt')}" />
        <span class="mod-input-label" data-mod-input="${p.id}" style="font-size:11.5px;color:var(--text-muted);display:none"></span>
        <button class="btn btn-ghost" data-mod-clear="${p.id}" style="padding:2px 8px;font-size:11px;display:none" title="Clear custom input">&#10005;</button>
        <button class="btn btn-ghost" data-mod-test="${p.id}" style="padding:5px 12px;font-size:12px">Run test</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" data-mod-approve="${p.id}" style="padding:5px 12px;font-size:12px" ${p.status === 'approved' ? 'disabled' : ''}>Approve</button>
        <button class="btn btn-danger" data-mod-reject="${p.id}" style="padding:5px 12px;font-size:12px" ${p.status === 'rejected' ? 'disabled' : ''}>Reject</button>
      </div>
      <div class="mod-test-result" data-test-result="${p.id}"></div>
    </div>
  `;
}

function codeModal(p: MarketplacePlugin): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:min(860px,calc(100vw - 40px))">
      <div style="display:flex;align-items:center;gap:10px">
        <h2>${p.name} <span style="color:var(--text-muted);font-weight:400;font-size:13px">v${p.version} by ${p.author}</span></h2>
        <span style="flex:1"></span>
        <button class="icon-btn" data-close style="color:var(--text-muted)">&#10005;</button>
      </div>
      <pre class="code-view" spellcheck="false">${escapeHtml(p.entry)}</pre>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Close</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  document.body.appendChild(overlay);
}

async function runTest(p: MarketplacePlugin, btn: HTMLButtonElement): Promise<void> {
  const resultEl = document.querySelector(`[data-test-result="${p.id}"]`) as HTMLElement | null;
  btn.disabled = true;
  btn.textContent = 'Testing…';
  try {
    const input = customInputs.get(p.id) ?? makeTestInput(p);
    const raw = await convertWithPlugin(
      {
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        author: p.author,
        icon: p.icon,
        iconColor: p.iconColor,
        inputs: p.inputs,
        outputs: p.outputs,
        entry: p.entry,
      },
      input,
    );
    const out = normalizeResult(raw, p);
    const size = out.data.byteLength;
    const preview = previewOutput(out);
    if (resultEl) {
      resultEl.innerHTML = `<div class="mod-test-pass">&#10003; Ran successfully with <b>${escapeHtml(input.name)}</b> — produced <b>${escapeHtml(out.name)}</b> (${size} bytes).<br/>${preview}</div>`;
    }
    toast('Test passed', 'success');
  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `<div class="mod-test-fail">&#10007; Test failed: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
    toast('Test failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run test';
  }
}

function normalizeResult(raw: unknown, p: MarketplacePlugin): { name: string; type: string; data: ArrayBuffer } {
  if (raw instanceof ArrayBuffer) {
    return { name: `test.${p.outputs[0] ?? 'out'}`, type: mimeFor(p.outputs[0] ?? 'bin'), data: raw };
  }
  const r = raw as { name?: string; type?: string; data?: ArrayBuffer };
  if (r && r.data instanceof ArrayBuffer) {
    return { name: r.name || `test.${p.outputs[0] ?? 'out'}`, type: r.type || mimeFor(p.outputs[0] ?? 'bin'), data: r.data };
  }
  throw new Error('Plugin returned an unsupported result (expected ArrayBuffer or { data: ArrayBuffer })');
}

function makeTestInput(p: MarketplacePlugin): ConvertInput {
  const ext = p.inputs[0] ?? 'txt';
  const name = `test.${ext}`;
  const data = sampleBytes(ext);
  return { name, ext, type: mimeFor(ext), data };
}

function sampleBytes(ext: string): ArrayBuffer {
  if (ext === 'png') {
    // 1x1 red PNG
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  if (['jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'avif', 'svg', 'mp3', 'wav', 'mp4', 'webm', 'mov', 'pdf', 'zip', 'tar', 'gz'].includes(ext)) {
    return new TextEncoder().encode(`delta.tools test sample for .${ext}`).buffer;
  }
  return new TextEncoder().encode('Hello, Delta.tools!').buffer;
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
    webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf',
    zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip',
    json: 'application/json', csv: 'text/csv', md: 'text/markdown',
    html: 'text/html', txt: 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

function previewOutput(out: { name: string; type: string; data: ArrayBuffer }): string {
  const isText = out.type.startsWith('text/') || out.type.includes('json') || out.type.includes('xml');
  if (isText) {
    try {
      const text = new TextDecoder().decode(out.data).slice(0, 200);
      return `<pre class="code-view" style="max-height:160px;margin-top:8px">${escapeHtml(text)}</pre>`;
    } catch {
      return '';
    }
  }
  return '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
