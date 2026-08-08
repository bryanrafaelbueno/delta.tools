import { CATEGORIES, type ConverterDef } from '../types';
import { icon, logo } from '../ui/icons';
import { state } from '../state';
import { api } from '../api';
import { toast } from '../ui/toast';
import { registry } from '../converters/registry';

export function renderDashboard(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';

  el.innerHTML = `
    <div class="hero">
      <div class="hero-center">
        <div class="hero-logo">${logo()}<span class="hero-title">Delta.tools</span></div>
        <div class="hero-search">
          ${icon('search')}
          <input type="text" id="hero-search-input" placeholder="Search for some tool..." autocomplete="off" />
          <span class="slash">/</span>
        </div>
        <div class="search-results" id="search-results" hidden></div>
      </div>
    </div>
  `;

  const search = el.querySelector('#hero-search-input') as HTMLInputElement;
  const results = el.querySelector('#search-results') as HTMLElement;
  const heroSearch = el.querySelector('.hero-search') as HTMLElement;

  function positionResults(): void {
    const rect = heroSearch.getBoundingClientRect();
    results.style.position = 'fixed';
    results.style.top = `${Math.round(rect.bottom + 10)}px`;
    results.style.left = `${Math.round(rect.left)}px`;
    results.style.width = `${Math.round(rect.width)}px`;
    results.style.maxHeight = `${Math.max(120, window.innerHeight - Math.round(rect.bottom) - 24)}px`;
  }

  function renderResults(query: string): void {
    const q = query.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      results.innerHTML = '';
      return;
    }
    const matches = registry
      .all()
      .map((c) => c.def)
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          `${d.from}->${d.to}`.includes(q) ||
          CATEGORIES[d.category].label.toLowerCase().includes(q),
      )
      .slice(0, 24);

    results.hidden = false;
    positionResults();
    if (matches.length === 0) {
      results.innerHTML = `<div class="search-empty">No tools match "${search.value.trim()}"</div>`;
      return;
    }
    results.innerHTML = matches.map(resultRow).join('');
    results.querySelectorAll('.search-result').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.hash = `/tool/${(row as HTMLElement).dataset.tool}`;
      });
    });
    bindResultFavs(results);
  }

  window.addEventListener('resize', () => {
    if (!results.hidden) positionResults();
  });

  search.addEventListener('input', () => renderResults(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && search.value.trim()) {
      e.preventDefault();
      const matches = registry
        .all()
        .map((c) => c.def)
        .filter((d) => {
          const q = search.value.trim().toLowerCase();
          return (
            d.name.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            `${d.from}->${d.to}`.includes(q)
          );
        });
      if (matches[0]) window.location.hash = `/tool/${matches[0].id}`;
    }
  });

  return el;
}

export function resultRow(def: ConverterDef): string {
  const fav = state.isFavorite(def.id);
  return `
    <div class="search-result" data-tool="${def.id}">
      <span class="search-result-icon">${def.icon}</span>
      <div class="search-result-info">
        <div class="search-result-name">${def.name}</div>
        <div class="search-result-desc">${def.description}</div>
      </div>
      <span class="search-result-badges">
        <span class="badge">${def.from} → ${def.to}</span>
        <span class="badge">${CATEGORIES[def.category].label}</span>
      </span>
      <button class="fav-btn ${fav ? 'fav-on' : ''}" data-fav="${def.id}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${icon('star')}</button>
    </div>
  `;
}

function bindResultFavs(root: HTMLElement): void {
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
