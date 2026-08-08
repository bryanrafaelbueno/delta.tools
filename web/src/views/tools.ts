import { state } from '../state';
import { registry } from '../converters/registry';
import { CATEGORIES, type ConverterDef } from '../types';
import { icon } from '../ui/icons';
import { api } from '../api';
import { toast } from '../ui/toast';
import { bindToolCards } from './dashboard';

export function renderTools(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div>
      <div class="page-title">Favorite Tools</div>
      <div class="page-sub">Your starred tools. Star a tool from its page or from search results to pin it here.</div>
    </div>
    <div class="panel">
      <div class="tool-grid" id="fav-grid"><div class="empty">Loading…</div></div>
    </div>
  `;

  const grid = el.querySelector('#fav-grid') as HTMLElement;
  refresh();

  function refresh(): void {
    const favs = state.favorites
      .map((id) => registry.get(id))
      .filter((c) => c !== undefined)
      .map((c) => c.def);

    if (!state.token) {
      grid.innerHTML = `<div class="empty"><a href="#/auth">Sign in</a> to save favorites.</div>`;
      return;
    }
    if (favs.length === 0) {
      grid.innerHTML = `<div class="empty">No favorites yet — star a tool to pin it here.<br/><a href="#/">Search for a tool →</a></div>`;
      return;
    }
    grid.innerHTML = favs.map(favCard).join('');
    bindToolCards(grid as HTMLElement);
    grid.querySelectorAll('[data-unfav]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-unfav')!;
        try {
          await api.removeFavorite(id);
          state.setFavorites(state.favorites.filter((f) => f !== id));
          toast('Removed from favorites', 'success');
          refresh();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Could not update favorite', 'error');
        }
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
        <div class="icon">${def.icon}</div>
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
