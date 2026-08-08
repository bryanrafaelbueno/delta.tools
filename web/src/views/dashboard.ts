import { registry } from '../converters/registry';
import { CATEGORIES, type Category, type ConverterDef } from '../types';

const CATEGORY_ORDER: Category[] = ['image', 'audio', 'video', 'document', 'archive', 'text'];

export function renderDashboard(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';

  const all = registry.all().map((c) => c.def);

  el.innerHTML = `
    <div class="page-title">Dashboard</div>
    <div class="page-sub">${all.length} tools ready — everything runs in your browser</div>
    <div class="panel">
      <div class="segment" id="cat-filter">
        <button data-cat="" class="active">All</button>
        ${CATEGORY_ORDER.map((c) => `<button data-cat="${c}">${CATEGORIES[c].icon} ${CATEGORIES[c].label}</button>`).join('')}
      </div>
      <div style="height: 14px"></div>
      <div class="tool-grid" id="tool-grid"></div>
    </div>
  `;

  const grid = el.querySelector('#tool-grid')!;
  const filter = el.querySelector('#cat-filter')!;

  function renderTools(cat: Category | '' = '', query = ''): void {
    let list = all;
    if (cat) list = list.filter((d) => d.category === cat);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          `${d.from}->${d.to}`.includes(q),
      );
    }
    grid.innerHTML = list
      .slice(0, 60)
      .map(toolCard)
      .join('');
    if (list.length === 0) {
      grid.innerHTML = `<div class="empty">No tools match your search.</div>`;
    }
  }

  filter.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    filter.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderTools(btn.dataset.cat as Category | '');
  });

  const search = document.getElementById('global-search') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderTools(currentCat(), search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('delta:search', { detail: search.value.trim() }));
      }
    });
  }

  el.addEventListener('delta:filter', ((e: Event) => {
    const detail = (e as CustomEvent).detail as string;
    renderTools(currentCat(), detail);
  }) as EventListener);

  function currentCat(): Category | '' {
    const activeBtn = filter.querySelector('button.active') as HTMLButtonElement | null;
    return (activeBtn?.dataset.cat as Category | '') || '';
  }

  renderTools();
  return el;
}

export function toolCard(def: ConverterDef): string {
  const multi = def.to === 'pdf-merge' ? ' ⧉' : '';
  return `
    <div class="tool-card" data-tool-id="${def.id}">
      <div class="icon">${def.icon}</div>
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
    card.addEventListener('click', () => {
      window.location.hash = `/tool/${card.getAttribute('data-tool-id')}`;
    });
  });
}
