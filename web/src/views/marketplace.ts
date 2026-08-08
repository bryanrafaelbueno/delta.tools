import { api } from '../api';
import { pluginStore } from '../plugins/store';
import { pluginManager } from '../plugins/manager';
import type { MarketplacePlugin } from '../types';
import { toast } from '../ui/toast';
import { state } from '../state';

export function renderMarketplace(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div>
      <div class="page-title">Marketplace</div>
      <div class="page-sub">Community-made converters, installed in one click. Every plugin runs sandboxed in your browser.</div>
    </div>
    <div class="panel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-ghost" id="btn-json">Install from JSON</button>
      <button class="btn btn-primary" id="btn-publish" ${state.token ? '' : 'disabled'}>${state.token ? 'Publish a plugin' : 'Sign in to publish'}</button>
      <span style="color:var(--text-muted);font-size:12.5px">${state.token ? '' : 'You need an account to publish plugins.'}</span>
    </div>
    <div class="panel">
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
        grid.innerHTML = `<div class="empty">The marketplace is empty. Be the first to publish a plugin!</div>`;
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
            btn.innerHTML = '✓ Installed';
            (btn as HTMLButtonElement).disabled = true;
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Install failed', 'error');
          }
        });
      });
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
        <div class="picon">${p.icon || '🧩'}</div>
        <div>
          <div class="pname">${p.name}</div>
          <div class="pauthor">by ${p.author} · v${p.version}</div>
        </div>
      </div>
      <div class="pdesc">${p.description}</div>
      <div class="pfooter">
        <div class="pstats">${p.inputs.map((i) => i.toUpperCase()).join(', ')} → ${p.outputs.map((o) => o.toUpperCase()).join(', ')} · ${p.downloads ?? 0} installs</div>
        <button class="btn btn-primary" data-install="${p.id}" style="padding:5px 12px;font-size:12px" ${isInstalled ? 'disabled' : ''}>${isInstalled ? '✓ Installed' : 'Install'}</button>
      </div>
    </div>
  `;
}

function installFromJson(): void {
  const text = prompt('Paste the plugin JSON manifest (with "entry" code):');
  if (!text) return;
  try {
    const manifest = JSON.parse(text);
    pluginStore
      .install(manifest)
      .then((m) => {
        pluginManager.activate(m);
        toast(`Installed "${m.name}"`, 'success');
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Invalid manifest', 'error'));
  } catch {
    toast('Invalid JSON', 'error');
  }
}

function publishModal(): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:min(620px,calc(100vw - 40px))">
      <h2>Publish a plugin</h2>
      <div class="page-sub" style="font-size:12.5px;color:var(--text-muted)">See <a href="https://github.com/bryanrafaelbueno/delta.tools/blob/main/docs/PLUGIN_API.md" target="_blank">docs/PLUGIN_API.md</a> to learn how to write one.</div>
      <div class="form-row">
        <div class="form-field"><label>Name</label><input id="p-name" placeholder="My Converter"/></div>
        <div class="form-field"><label>ID (reverse domain)</label><input id="p-id" placeholder="com.example.myconverter"/></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Version</label><input id="p-version" value="1.0.0"/></div>
        <div class="form-field"><label>Icon (emoji)</label><input id="p-icon" value="🧩"/></div>
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
  overlay.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#p-submit')!.addEventListener('click', async () => {
    const inputs = (overlay.querySelector('#p-inputs') as HTMLInputElement).value
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
      icon: (overlay.querySelector('#p-icon') as HTMLInputElement).value.trim() || '🧩',
      inputs,
      outputs,
      entry: (overlay.querySelector('#p-entry') as HTMLTextAreaElement).value,
    };
    try {
      await api.publishPlugin(manifest);
      toast('Plugin published to the marketplace!', 'success');
      overlay.remove();
      window.location.hash = '/settings';
      setTimeout(() => (window.location.hash = '/marketplace'), 30);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error');
    }
  });
  document.body.appendChild(overlay);
}
