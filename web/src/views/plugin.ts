import { api } from '../api';
import { pluginStore } from '../plugins/store';
import { pluginManager } from '../plugins/manager';
import type { MarketplacePlugin } from '../types';
import { toast } from '../ui/toast';
import { state } from '../state';

export function renderPlugin(id: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div class="page-title">Plugin</div>
    <div class="panel"><div class="empty">Loading…</div></div>
  `;

  const panel = el.querySelector('.panel') as HTMLElement;

  (async () => {
    let plugin: MarketplacePlugin | undefined;
    try {
      const res = await api.getPlugin(id);
      plugin = res.plugin as MarketplacePlugin;
    } catch {
      // maybe installed locally only
    }
    if (!plugin) {
      const local = await pluginStore.get(id);
      if (local) {
        panel.innerHTML = localCard(local);
      } else {
        panel.innerHTML = `<div class="empty">Plugin not found.</div>`;
      }
      return;
    }
    const installed = await pluginStore.isInstalled(id);
    panel.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div class="picon" style="width:56px;height:56px;font-size:28px;border-radius:14px;background:var(--hover);display:flex;align-items:center;justify-content:center">${plugin.icon || '🧩'}</div>
        <div style="flex:1">
          <div style="font-size:19px;font-weight:700">${plugin.name}</div>
          <div style="color:var(--text-muted);font-size:12.5px">by ${plugin.author} · v${plugin.version} · ${plugin.downloads ?? 0} installs</div>
        </div>
        <button class="btn btn-primary" id="install-btn" ${installed ? 'disabled' : ''}>${installed ? '✓ Installed' : 'Install'}</button>
      </div>
      <div style="height:8px"></div>
      <div style="color:var(--text-secondary);font-size:13.5px">${plugin.description}</div>
      <div style="height:6px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${plugin.inputs.map((i) => `<span class="badge">IN .${i.toUpperCase()}</span>`).join('')}
        ${plugin.outputs.map((o) => `<span class="badge accent">OUT .${o.toUpperCase()}</span>`).join('')}
      </div>
      ${state.token && state.user?.username === plugin.author
        ? `<div style="height:12px"></div><button class="btn btn-danger" id="delete-btn" style="align-self:flex-start">Delete from marketplace</button>`
        : ''}
    `;
    panel.querySelector('#install-btn')?.addEventListener('click', async () => {
      try {
        await pluginStore.install(plugin!);
        pluginManager.activate(plugin!);
        api.installPlugin(id).catch(() => undefined);
        toast(`Installed "${plugin!.name}"`, 'success');
        const btn = panel.querySelector('#install-btn') as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = '✓ Installed';
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Install failed', 'error');
      }
    });
    panel.querySelector('#delete-btn')?.addEventListener('click', async () => {
      if (!confirm('Delete this plugin from the marketplace?')) return;
      try {
        await api.publishPlugin({ ...plugin, _delete: true });
        toast('Plugin deleted', 'success');
        window.location.hash = '/marketplace';
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    });
  })();

  return el;
}

function localCard(local: { id: string; name: string; version: string; description: string; author: string; icon: string; inputs: string[]; outputs: string[] }): string {
  return `
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div class="picon" style="width:56px;height:56px;font-size:28px;border-radius:14px;background:var(--hover);display:flex;align-items:center;justify-content:center">${local.icon || '🧩'}</div>
      <div style="flex:1">
        <div style="font-size:19px;font-weight:700">${local.name}</div>
        <div style="color:var(--text-muted);font-size:12.5px">by ${local.author} · v${local.version} · installed locally</div>
      </div>
    </div>
    <div style="height:8px"></div>
    <div style="color:var(--text-secondary);font-size:13.5px">${local.description}</div>
    <div style="height:6px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${local.inputs.map((i) => `<span class="badge">IN .${i.toUpperCase()}</span>`).join('')}
      ${local.outputs.map((o) => `<span class="badge accent">OUT .${o.toUpperCase()}</span>`).join('')}
    </div>
  `;
}
