import { state } from '../state';
import { registry } from '../converters/registry';
import { CATEGORIES, type ConverterDef } from '../types';
import { icon } from '../ui/icons';
import { api } from '../api';
import { toast } from '../ui/toast';
import { pluginStore } from '../plugins/store';
import { pluginManager } from '../plugins/manager';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';
import { svgIcons } from '../ui/svg-icons';
import { bindToolCards } from './dashboard';

export function renderMyPlugins(tab: 'favorites' | 'manage' = 'favorites'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div>
      <div class="page-title">My plugins</div>
      <div class="page-sub">Your starred tools and the plugins you've installed.</div>
    </div>
    <div class="segment" id="mp-tabs">
      <button data-tab="favorites" class="${tab === 'favorites' ? 'active' : ''}"><img src="${svgIcons.image}" width="14" height="14"/> Favorite Tools</button>
      <button data-tab="manage" class="${tab === 'manage' ? 'active' : ''}"><img src="${svgIcons.plugin}" width="14" height="14"/> Manage plugins</button>
    </div>
    <div class="panel" id="mp-body">
      <div class="empty">Loading…</div>
    </div>
  `;

  const body = el.querySelector('#mp-body') as HTMLElement;
  const tabs = el.querySelector('#mp-tabs')!;

  tabs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    const t = btn.dataset.tab as 'favorites' | 'manage';
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    window.location.hash = t === 'manage' ? '/tools/manage' : '/tools';
  });

  if (tab === 'manage') {
    renderManage();
  } else {
    renderFavorites();
  }

  function renderFavorites(): void {
    const favs = state.favorites
      .map((id) => registry.get(id))
      .filter((c) => c !== undefined)
      .map((c) => c.def);

    if (!state.token) {
      body.innerHTML = `<div class="empty"><a href="#/auth">Sign in</a> to save favorites.</div>`;
      return;
    }
    if (favs.length === 0) {
      body.innerHTML = `<div class="empty">No favorites yet — star a tool to pin it here.<br/><a href="#/">Search for a tool →</a></div>`;
      return;
    }
    body.innerHTML = `<div class="tool-grid">${favs.map(favCard).join('')}</div>`;
    bindToolCards(body);
    hydrateSvgIconsAsync(body);
    body.querySelectorAll('[data-unfav]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-unfav')!;
        try {
          await api.removeFavorite(id);
          state.setFavorites(state.favorites.filter((f) => f !== id));
          toast('Removed from favorites', 'success');
          renderFavorites();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Could not update favorite', 'error');
        }
      });
    });
  }

  async function renderManage(): Promise<void> {
    const plugins = await pluginStore.list();
    if (plugins.length === 0) {
      body.innerHTML = `<div class="empty">You haven't installed any plugins yet.<br/><a href="#/marketplace">Browse the marketplace →</a></div>`;
      return;
    }
    body.innerHTML = `<div class="plugin-grid">${plugins.map((p) => {
      const converterCount = registry.all().filter((c) => c.def.pluginId === p.id).length;
      return `
        <div class="plugin-card">
          <div class="head">
            <div class="picon">${renderIcon(p.icon || svgIcons.plugin, p.iconColor, 22)}</div>
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
    }).join('')}</div>`;
    hydrateSvgIconsAsync(body);
    body.querySelectorAll('[data-uninstall]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-uninstall')!;
        pluginManager.deactivate(id);
        await pluginStore.uninstall(id);
        toast('Plugin uninstalled', 'success');
        renderManage();
      });
    });
  }

  return el;
}

function favCard(def: ConverterDef): string {
  const multi = def.to === 'pdf-merge' ? ' ⧉' : '';
  return `
    <div class="tool-card" data-tool-id="${def.id}">
      <div class="tool-card-top">
        <div class="icon">${renderIcon(def.icon || svgIcons.plugin, def.iconColor, 20)}</div>
        <button class="fav-btn fav-on" data-unfav="${def.id}" title="Remove from favorites">${icon('star')}</button>
      </div>
      <div class="name">${def.name}${multi}</div>
      <div class="desc">${def.description}</div>
      <div class="meta">
        <span class="badge">${def.from} → ${def.to}</span>
        <span class="badge">${CATEGORIES[def.category].label}</span>
      </div>
    </div>
  `;
}
