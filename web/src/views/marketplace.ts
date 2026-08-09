import { api } from '../api';
import { pluginStore } from '../plugins/store';
import { pluginManager } from '../plugins/manager';
import type { MarketplacePlugin } from '../types';
import { toast } from '../ui/toast';
import { state } from '../state';
import { openIconPicker, type PickedIcon } from '../ui/iconpicker';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';
import { svgIcons } from '../ui/svg-icons';

export function renderMarketplace(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:10px 0 8px">
      <div class="page-title">Marketplace</div>
      <div class="page-sub">Community-made converters, installed in one click. Every plugin runs sandboxed in your browser.</div>
    </div>
    <div class="panel" style="align-items:center;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
        <button class="btn btn-ghost" id="btn-json">Install from JSON</button>
        <button class="btn btn-primary" id="btn-publish" ${state.token ? '' : 'disabled'}>${state.token ? 'Publish a plugin' : 'Sign in to publish'}</button>
        <span style="color:var(--text-muted);font-size:12.5px">${state.token ? '' : 'You need an account to publish plugins.'}</span>
      </div>
      <div class="plugin-grid" id="plugin-grid"><div class="empty">Loading marketplace…</div></div>
    </div>
  `;

  const grid = el.querySelector('#plugin-grid') as HTMLElement;

  el.querySelector('#btn-json')!.addEventListener('click', installFromJson);

  el.querySelector('#btn-publish')!.addEventListener('click', () => {
    if (!state.token) {
      window.location.hash = '/auth';
      return;
    }
    publishModal();
  });

  api
    .listPlugins()
    .then(async (res) => {
      const plugins = res.plugins as MarketplacePlugin[];
      if (plugins.length === 0) {
        const panel = el.querySelector('.panel') as HTMLElement;
        panel.classList.add('marketplace-empty');
        grid.style.display = 'none';
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'The marketplace is empty. Be the first to publish a plugin!';
        panel.appendChild(empty);
        return;
      }
      const installed = new Set((await pluginStore.list()).map((p) => p.id));
      grid.innerHTML = plugins.map((p) => pluginCard(p, installed.has(p.id))).join('');
      grid.querySelectorAll('[data-install]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-install')!;
          const plugin = plugins.find((p) => p.id === id)!;
          try {
            await pluginStore.install(plugin);
            pluginManager.activate(plugin);
            api.installPlugin(id).catch(() => undefined);
            toast(`Installed "${plugin.name}"`, 'success');
            btn.innerHTML = 'Installed';
            (btn as HTMLButtonElement).disabled = true;
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Install failed', 'error');
          }
        });
      });
      hydrateSvgIconsAsync(grid);
      grid.querySelectorAll('[data-open-plugin]').forEach((card) => {
        card.addEventListener('click', () => {
          window.location.hash = `/plugin/${card.getAttribute('data-open-plugin')}`;
        });
      });
    })
    .catch((err) => {
      grid.innerHTML = `<div class="empty">Could not load marketplace: ${err instanceof Error ? err.message : String(err)}. Is the server running?</div>`;
    });

  return el;
}

function pluginCard(p: MarketplacePlugin, isInstalled: boolean): string {
  return `
    <div class="plugin-card" data-open-plugin="${p.id}">
      <div class="head">
        <div class="picon">${renderIcon(p.icon || svgIcons.plugin, p.iconColor, 22)}</div>
        <div>
          <div class="pname">${p.name}</div>
          <div class="pauthor">by ${p.author} · v${p.version}</div>
        </div>
      </div>
      <div class="pdesc">${p.description}</div>
      <div class="pfooter">
        <div class="pstats">${p.inputs.map((i) => i.toUpperCase()).join(', ')} → ${p.outputs.map((o) => o.toUpperCase()).join(', ')} · ${p.downloads ?? 0} installs</div>
        <button class="btn btn-primary" data-install="${p.id}" style="padding:5px 12px;font-size:12px" ${isInstalled ? 'disabled' : ''}>${isInstalled ? 'Installed' : 'Install'}</button>
      </div>
    </div>
  `;
}

function installFromJson(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:min(560px,calc(100vw - 40px))">
      <div style="display:flex;align-items:center;gap:10px">
        <h2>Install from JSON</h2>
        <span style="flex:1"></span>
        <button class="icon-btn" data-close style="color:var(--text-muted)">&#10005;</button>
      </div>
      <div class="page-sub" style="font-size:12.5px;color:var(--text-muted)">Paste a plugin manifest (with the <code>entry</code> code). See <a href="https://github.com/bryanrafaelbueno/delta.tools/blob/main/docs/PLUGIN_API.md" target="_blank">docs/PLUGIN_API.md</a>.</div>
      <div class="form-field" style="margin-top:14px">
        <label>Plugin JSON</label>
        <textarea id="ij-input" rows="14" spellcheck="false" placeholder='{ "id": "com.example.tool", "name": "My Tool", … "entry": "return { convert: async (input) => { … } }" }' style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;resize:vertical"></textarea>
        <div class="ij-error" id="ij-error" style="display:none"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="ij-install" disabled>Install</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#ij-input') as HTMLTextAreaElement;
  const errorEl = overlay.querySelector('#ij-error') as HTMLElement;
  const installBtn = overlay.querySelector('#ij-install') as HTMLButtonElement;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));

  let manifest: unknown = null;
  const update = (): void => {
    errorEl.style.display = 'none';
    const text = input.value.trim();
    if (!text) {
      manifest = null;
      installBtn.disabled = true;
      return;
    }
    try {
      manifest = JSON.parse(text);
      installBtn.disabled = false;
    } catch (err) {
      manifest = null;
      installBtn.disabled = true;
      errorEl.style.display = 'block';
      errorEl.textContent = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  input.addEventListener('input', update);

  installBtn.addEventListener('click', async () => {
    if (!manifest) return;
    installBtn.disabled = true;
    try {
      const m = await pluginStore.install(manifest);
      pluginManager.activate(m);
      toast(`Installed "${m.name}"`, 'success');
      overlay.remove();
    } catch (err) {
      errorEl.style.display = 'block';
      errorEl.textContent = err instanceof Error ? err.message : 'Invalid manifest';
      installBtn.disabled = false;
    }
  });

  update();
}

function publishModal(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:min(620px,calc(100vw - 40px))">
      <h2>Publish a plugin</h2>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div class="page-sub" style="font-size:12.5px;color:var(--text-muted);flex:1">Fill the form below or import a manifest JSON file.</div>
        <label class="btn btn-ghost" for="p-json-file" style="cursor:pointer;padding:6px 12px;font-size:12px;margin:0">Import JSON…</label>
        <input type="file" id="p-json-file" accept=".json,application/json" style="display:none"/>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Name</label><input id="p-name" placeholder="My Converter"/></div>
        <div class="form-field"><label>ID (reverse domain)</label><input id="p-id" placeholder="com.example.myconverter"/></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Version</label><input id="p-version" value="1.0.0"/></div>
        <div class="form-field">
          <label>Icon</label>
          <div style="display:flex;align-items:center;gap:10px">
            <div id="p-icon-preview" class="picon" style="width:38px;height:38px;background:var(--hover);border-radius:8px;display:flex;align-items:center;justify-content:center"><span class="svg-icon" data-src="${svgIcons.plugin}" style="width:22px;height:22px"></span></div>
            <button class="btn btn-ghost" id="p-icon-btn" type="button" style="padding:6px 12px;font-size:12px">Choose icon…</button>
            <button class="btn btn-ghost" id="p-icon-clear" type="button" style="padding:6px 12px;font-size:12px;display:none">Reset</button>
          </div>
        </div>
      </div>
      <div class="form-field"><label>Description</label><input id="p-desc" placeholder="What does it convert?"/></div>
      <div class="form-row">
        <div class="form-field"><label>Input extensions (comma)</label><input id="p-inputs" placeholder="png, jpg"/></div>
        <div class="form-field"><label>Output extensions (comma)</label><input id="p-outputs" placeholder="webp"/></div>
      </div>
      <div class="form-field"><label>Plugin code</label><textarea id="p-entry" rows="10" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:12px;resize:vertical" placeholder="return { convert: async (input) => { ... } }"></textarea></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="p-submit">Publish</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  hydrateSvgIconsAsync(overlay);

  let picked: PickedIcon | null = null;
  const preview = overlay.querySelector('#p-icon-preview') as HTMLElement;
  const clearBtn = overlay.querySelector('#p-icon-clear') as HTMLButtonElement;
  overlay.querySelector('#p-icon-btn')!.addEventListener('click', async () => {
    const res = await openIconPicker(picked ?? undefined);
    if (!res) return;
    picked = res;
    preview.innerHTML = renderIcon(res.url, res.color, 22);
    hydrateSvgIconsAsync(preview);
    clearBtn.style.display = '';
  });
  clearBtn.addEventListener('click', () => {
    picked = null;
    preview.innerHTML = `<span class="svg-icon" data-src="${svgIcons.plugin}" style="width:22px;height:22px"></span>`;
    hydrateSvgIconsAsync(preview);
    clearBtn.style.display = 'none';
  });

  // Import a manifest .json file and prefill every field
  overlay.querySelector('#p-json-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const m = JSON.parse(text);
      if (!m || typeof m !== 'object') throw new Error('manifest must be a JSON object');
      const set = (sel: string, val: unknown): void => {
        const el = overlay.querySelector(sel) as HTMLInputElement;
        if (el && val != null) el.value = String(val);
      };
      set('#p-name', m.name);
      set('#p-id', m.id);
      set('#p-version', m.version);
      set('#p-desc', m.description);
      set('#p-inputs', Array.isArray(m.inputs) ? m.inputs.join(', ') : m.inputs);
      set('#p-outputs', Array.isArray(m.outputs) ? m.outputs.join(', ') : m.outputs);
      if (typeof m.entry === 'string') {
        (overlay.querySelector('#p-entry') as HTMLTextAreaElement).value = m.entry;
      }
      // Icon: prefer the picked icon; if the manifest carries an SVG data URI
      // or http URL, show it in the preview.
      const icon = typeof m.icon === 'string' && m.icon.trim() ? m.icon : null;
      if (icon && /^(https?:|data:)/.test(icon)) {
        picked = { url: icon, color: typeof m.iconColor === 'string' ? m.iconColor : '' };
        preview.innerHTML = renderIcon(picked.url, picked.color, 22);
        hydrateSvgIconsAsync(preview);
        clearBtn.style.display = '';
      }
      toast('Manifest imported — review and publish', 'success');
    } catch (err) {
      toast(err instanceof Error ? `Invalid manifest: ${err.message}` : 'Invalid manifest file', 'error');
    }
    (e.target as HTMLInputElement).value = '';
  });

  overlay.querySelector('#p-submit')!.addEventListener('click', async () => {    const inputs = (overlay.querySelector('#p-inputs') as HTMLInputElement).value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const outputs = (overlay.querySelector('#p-outputs') as HTMLInputElement).value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const manifest = {
      id: (overlay.querySelector('#p-id') as HTMLInputElement).value.trim(),
      name: (overlay.querySelector('#p-name') as HTMLInputElement).value.trim(),
      version: (overlay.querySelector('#p-version') as HTMLInputElement).value.trim(),
      description: (overlay.querySelector('#p-desc') as HTMLInputElement).value.trim(),
      icon: picked?.url ?? svgIcons.plugin,
      iconColor: picked?.color,
      inputs,
      outputs,
      entry: (overlay.querySelector('#p-entry') as HTMLTextAreaElement).value,
    };
    try {
      await api.publishPlugin(manifest);
      toast('Plugin submitted to moderation!', 'success');
      overlay.remove();
      window.location.hash = '/settings';
      setTimeout(() => (window.location.hash = '/marketplace'), 30);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error');
    }
  });
  document.body.appendChild(overlay);
}
