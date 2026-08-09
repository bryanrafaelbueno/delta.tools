import { CATEGORIES, type Category, type ConverterDef } from '../types';
import { icon, logo } from '../ui/icons';
import { state } from '../state';
import { api } from '../api';
import { toast } from '../ui/toast';
import { registry } from '../converters/registry';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';

const HOME_CATEGORIES: Category[] = ['image', 'audio', 'video', 'document', 'archive', 'text'];

// Curated "everyone uses these" converters, shown on the dashboard so the page
// reads as a file-converter tool at first glance instead of a chat search box.
const POPULAR = [
  'img-png-jpg',
  'img-jpg-png',
  'aud-mp3-wav',
  'vid-mp4-mov',
  'pdf-img-png',
  'img-pdf',
  'pdf-merge',
  'txt-json-pretty',
  'arc-zip-tar',
  'repair-vid-mkv',
];

const QUICK_CHIPS: Array<[string, string]> = [
  ['PNG → JPG', 'img-png-jpg'],
  ['Video → MP4', 'vid-mov-mp4'],
  ['PDF → Images', 'pdf-img-png'],
  ['Images → PDF', 'img-pdf'],
  ['JSON pretty', 'txt-json-pretty'],
  ['Repair old video', 'repair-vid-mkv'],
];

export function renderDashboard(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view home';

  const popular = POPULAR.map((id) => registry.get(id)).filter((c) => c !== undefined).map((c) => c.def);
  const byCategory = new Map<Category, ConverterDef[]>();
  for (const cat of HOME_CATEGORIES) {
    byCategory.set(
      cat,
      registry.all().filter((c) => c.def.category === cat).map((c) => c.def),
    );
  }

  el.innerHTML = `
    <div class="hero">
      <div class="hero-center">
        <div class="hero-logo">${logo()}<span class="hero-title">Delta.tools</span></div>
        <h1 class="hero-headline">Convert files. <span class="hero-grad">Right in your browser.</span></h1>
        <p class="hero-sub">Images, audio, video, PDFs and archives — private, free and instant. No uploads, no waiting.</p>
        <div class="hero-search">
          ${icon('search')}
          <input type="text" id="hero-search-input" placeholder="Search 140+ tools… e.g. wav, pdf, base64" autocomplete="off" />
          <span class="slash">/</span>
        </div>
        <div class="search-results" id="search-results" hidden></div>
        <div class="hero-chips">
          ${QUICK_CHIPS.map(([label, id]) => `<button class="chip" data-quick="${id}">${label}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="home-sections">
      <section class="home-section">
        <div class="home-section-head">
          <h2>What do you want to convert?</h2>
          <a class="home-link" href="#/browse">Browse all tools →</a>
        </div>
        <div class="home-cats">
          ${HOME_CATEGORIES.map((cat) => {
            const count = byCategory.get(cat)?.length ?? 0;
            return `
              <a class="cat-card" data-cat="${cat}" href="#/browse/${cat}">
                <span class="cat-icon">${renderIcon(CATEGORIES[cat].icon, undefined, 22)}</span>
                <span class="cat-name">${CATEGORIES[cat].label}s</span>
                <span class="cat-count">${count} tools</span>
              </a>
            `;
          }).join('')}
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head">
          <h2>Popular tools</h2>
        </div>
        <div class="tool-grid">
          ${popular.map(toolCard).join('')}
        </div>
      </section>

    </div>
  `;

  hydrateSvgIconsAsync(el);

  // Popular-tools grid: tool cards are inert until their click handlers are
  // bound, so wire them up along with the fav buttons.
  bindToolCards(el);

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
    hydrateSvgIconsAsync(results);
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

  el.querySelectorAll('.chip[data-quick]').forEach((chip) => {
    chip.addEventListener('click', () => {
      window.location.hash = `/tool/${chip.getAttribute('data-quick')}`;
    });
  });

  const grid = el.querySelector('.home-cats');
  grid?.querySelectorAll('.cat-card[data-cat]').forEach((card) => {
    card.addEventListener('click', () => {
      window.location.hash = `/browse/${card.getAttribute('data-cat')}`;
    });
  });

  return el;
}

export function resultRow(def: ConverterDef): string {
  const fav = state.isFavorite(def.id);
  return `
    <div class="search-result" data-tool="${def.id}">
      <span class="search-result-icon">${renderIcon(def.icon, def.iconColor, 18)}</span>
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
        <div class="icon">${renderIcon(def.icon, def.iconColor, 20)}</div>
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
