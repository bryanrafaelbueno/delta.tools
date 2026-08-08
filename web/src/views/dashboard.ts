import { CATEGORIES, type ConverterDef } from '../types';
import { icon, logo } from '../ui/icons';
import { state } from '../state';
import { api } from '../api';
import { toast } from '../ui/toast';

export function renderDashboard(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';

  el.innerHTML = `
    <div class="hero">
      <div class="hero-logo">${logo()}<span class="hero-title">Delta.tools</span></div>
      <div class="hero-search">
        ${icon('search')}
        <input type="text" id="hero-search-input" placeholder="Search for some tool..." autocomplete="off" />
        <span class="slash">/</span>
      </div>
    </div>
  `;

  const search = el.querySelector('#hero-search-input') as HTMLInputElement;
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && search.value.trim()) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('delta:search', { detail: search.value.trim() }));
    }
  });

  return el;
}

export function toolCard(def: ConverterDef): string {
  const multi = def.to === 'pdf-merge' ? ' ⧉' : '';
  const fav = state.isFavorite(def.id);
  return `
    <div class="tool-card" data-tool-id="${def.id}">
      <div class="tool-card-top">
        <div class="icon">${def.icon}</div>
        <button class="fav-btn ${fav ? 'fav-on' : ''}" data-fav="${def.id}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${icon('star')}</button>
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

export function bindToolCards(root: HTMLElement): void {
  root.querySelectorAll('.tool-card[data-tool-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.fav-btn')) return;
      window.location.hash = `/tool/${card.getAttribute('data-tool-id')}`;
    });
  });
  root.querySelectorAll('.fav-btn[data-fav]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-fav')!;
      if (!state.token) {
        toast('Sign in to save favorites', 'error');
        window.location.hash = '/auth';
        return;
      }
      const isFav = state.isFavorite(id);
      try {
        if (isFav) {
          await api.removeFavorite(id);
          state.setFavorites(state.favorites.filter((f) => f !== id));
        } else {
          await api.addFavorite(id);
          state.setFavorites([...state.favorites, id]);
        }
        btn.classList.toggle('fav-on', !isFav);
        (btn as HTMLButtonElement).title = isFav ? 'Add to favorites' : 'Remove from favorites';
        toast(isFav ? 'Removed from favorites' : 'Added to favorites', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not update favorite', 'error');
      }
    });
  });
}
