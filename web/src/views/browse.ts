import { registry } from '../converters/registry';
import { CATEGORIES, type Category } from '../types';
import { bindToolCards, toolCard } from './dashboard';
import { renderIcon, hydrateSvgIconsAsync } from '../ui/icon-render';
import { icon } from '../ui/icons';

const VALID: Category[] = ['image', 'audio', 'video', 'document', 'archive', 'text', 'other'];

// Full tool browser: pick a category (or All) and search within it.
export function renderBrowse(category?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  const active: Category | 'all' = category && (VALID as string[]).includes(category) ? (category as Category) : 'all';

  const all = registry.all().map((c) => c.def);

  el.innerHTML = `
    <div>
      <div class="page-title">Browse tools</div>
      <div class="page-sub">Every converter, sorted by type. Pick a category or search below.</div>
    </div>
    <div class="segment" id="browse-tabs" style="flex-wrap:wrap">
      <button data-cat="all" class="${active === 'all' ? 'active' : ''}">All (${all.length})</button>
      ${VALID.map((c) => {
        const count = all.filter((d) => d.category === c).length;
        return `<button data-cat="${c}" class="${active === c ? 'active' : ''}"><span class="tab-icon">${renderIcon(CATEGORIES[c].icon, undefined, 13)}</span> ${CATEGORIES[c].label} (${count})</button>`;
      }).join('')}
    </div>
    <div class="hero-search" style="max-width:480px">
      ${icon('search')}
      <input type="text" id="browse-search" placeholder="Filter ${active === 'all' ? 'all' : CATEGORIES[active].label.toLowerCase()} tools…" autocomplete="off" />
    </div>
    <div class="panel" id="browse-body">
      <div class="empty">Loading…</div>
    </div>
  `;

  hydrateSvgIconsAsync(el);

  const body = el.querySelector('#browse-body') as HTMLElement;
  const search = el.querySelector('#browse-search') as HTMLInputElement;
  const tabs = el.querySelector('#browse-tabs') as HTMLElement;

  function render(): void {
    const q = search.value.trim().toLowerCase();
    const list = all.filter((d) => {
      if (active !== 'all' && d.category !== active) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        `${d.from}->${d.to}`.includes(q)
      );
    });
    if (list.length === 0) {
      body.innerHTML = `<div class="empty">No tools match your search.</div>`;
      return;
    }
    body.innerHTML = `<div class="tool-grid">${list.map(toolCard).join('')}</div>`;
    bindToolCards(body);
    hydrateSvgIconsAsync(body);
  }

  tabs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    window.location.hash = `/browse/${btn.dataset.cat === 'all' ? '' : btn.dataset.cat}`;
  });

  search.addEventListener('input', render);
  render();

  return el;
}
