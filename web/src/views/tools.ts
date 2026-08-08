import { pluginStore } from '../plugins/store';
import { pluginManager } from '../plugins/manager';
import { registry } from '../converters/registry';
import { toast } from '../ui/toast';

export function renderTools(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div>
      <div class="page-title">Your tools</div>
      <div class="page-sub">Plugins you've installed. Uninstall any time — nothing is locked in.</div>
    </div>
    <div class="panel">
      <div class="plugin-grid" id="tools-grid"><div class="empty">Loading…</div></div>
    </div>
  `;

  const grid = el.querySelector('#tools-grid') as HTMLElement;
  refresh();

  async function refresh(): Promise<void> {
    const plugins = await pluginStore.list();
    if (plugins.length === 0) {
      grid.innerHTML = `<div class="empty">You haven't installed any plugins yet.<br/><a href="#/marketplace">Browse the marketplace →</a></div>`;
      return;
    }
    grid.innerHTML = plugins.map((p) => {
      const converterCount = registry.all().filter((c) => c.def.pluginId === p.id).length;
      return `
        <div class="plugin-card">
          <div class="head">
            <div class="picon">${p.icon || '🧩'}</div>
            <div>
              <div class="pname">${p.name}</div>
              <div class="pauthor">by ${p.author} · v${p.version}</div>
            </div>
          </div>
          <div class="pdesc">${p.description}</div>
          <div class="pfooter">
            <div class="pstats">${p.inputs.map((i) => i.toUpperCase()).join(', ')} → ${p.outputs.map((o) => o.toUpperCase()).join(', ')} · ${converterCount} converters</div>
            <button class="btn btn-danger" data-uninstall="${p.id}" style="padding:5px 12px;font-size:12px">Uninstall</button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-uninstall]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-uninstall')!;
        pluginManager.deactivate(id);
        await pluginStore.uninstall(id);
        toast('Plugin uninstalled', 'success');
        refresh();
        const counter = document.getElementById('installed-count');
        if (counter) counter.textContent = String((await pluginStore.list()).length);
      });
    });
  }

  return el;
}
