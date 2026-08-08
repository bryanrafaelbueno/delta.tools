import {
  fetchIcons,
  fetchCategories,
  iconUrl,
  matchesQuery,
  loadCustomIcons,
  addCustomIcon,
  removeCustomIcon,
  type SvglIcon,
} from './svgl';
import { inlineSvg, svgToDataUri } from './icon-render';

export interface PickedIcon {
  url: string;
  color: string;
}

// Empty string means "keep the icon's original colors" (no tint).
const COLORS = [
  '', '#ffffff', '#ff5c5c', '#ff9f43', '#ffd166', '#4ade80', '#00d4aa',
  '#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#f97316', '#94a3b8',
];

type AnyIcon = SvglIcon & { custom?: boolean };

export function openIconPicker(current?: PickedIcon): Promise<PickedIcon | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal icon-picker">
        <div style="display:flex;align-items:center;gap:10px">
          <h2>Pick an icon</h2>
          <button class="ip-add" id="ip-add" title="Add custom SVG">＋</button>
          <span style="flex:1"></span>
          <button class="icon-btn" data-close style="color:var(--text-muted)">&#10005;</button>
        </div>
        <input type="text" id="ip-search" placeholder="Search icons…" autocomplete="off" />
        <div class="ip-cats" id="ip-cats"></div>
        <div class="ip-colors">
          ${COLORS.map((c) =>
            c
              ? `<button class="ip-color" data-color="${c}" style="background:${c}" title="${c}"></button>`
              : `<button class="ip-color ip-color-original" data-color="" title="Original colors" style="background:conic-gradient(#ff5c5c, #ffd166, #4ade80, #38bdf8, #a78bfa, #f472b6, #ff5c5c)"></button>`,
          ).join('')}
        </div>
        <div class="ip-grid" id="ip-grid"><div class="empty">Loading icons…</div></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary" id="ip-pick" disabled>Use icon</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let all: AnyIcon[] = [];
    let cats: { category: string; total: number }[] = [];
    let activeCat = 'All';
    let query = '';
    let selected: AnyIcon | null = null;
    let color = current?.color || '';

    const grid = overlay.querySelector('#ip-grid') as HTMLElement;
    const search = overlay.querySelector('#ip-search') as HTMLInputElement;
    const catsEl = overlay.querySelector('#ip-cats') as HTMLElement;
    const pickBtn = overlay.querySelector('#ip-pick') as HTMLButtonElement;
    let observer: IntersectionObserver | null = null;

    // Hydrate SVGs with a small concurrency pool so the whole grid fills in
    // progressively (rate-limit friendly). Works without IntersectionObserver too.
    function hydrateImg(el: HTMLElement): void {
      const url = el.dataset.src!;
      void inlineSvg(url, color).then((uri) => {
        if (!uri) {
          el.removeAttribute('data-src');
          el.classList.add('svg-icon-failed');
          el.style.background = 'var(--hover)';
          return;
        }
        el.innerHTML = `<img src="${uri}" alt="" style="width:100%;height:100%;object-fit:contain"/>`;
        el.removeAttribute('data-src');
        el.removeAttribute('data-color');
      });
    }

    function observeGrid(): void {
      observer?.disconnect();
      const els = [...grid.querySelectorAll('.svg-icon[data-src]')] as HTMLElement[];
      if (els.length === 0) return;
      // Hydrate with a generous concurrency pool; the in-memory svgCache means
      // re-renders (search/category changes) hit cache instantly.
      const POOL = 24;
      let i = 0;
      async function pump(): Promise<void> {
        while (i < els.length) {
          const slice = els.slice(i, i + POOL);
          i += POOL;
          await Promise.all(slice.map(hydrateImg));
        }
      }
      void pump();
      if (typeof IntersectionObserver === 'undefined') return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            observer?.unobserve(el);
            if (el.dataset.src) hydrateImg(el);
          }
        },
        { root: grid, rootMargin: '200px' },
      );
      for (const el of els) observer.observe(el);
    }

    function applyColorButtons(): void {
      overlay.querySelectorAll('.ip-color').forEach((b) => {
        (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.color === color);
      });
    }

    function render(): void {
      const q = query.trim().toLowerCase();
      const list = all.filter((i) => {
        if (activeCat !== 'All') {
          const catsOf = Array.isArray(i.category) ? i.category : [i.category];
          if (!catsOf.includes(activeCat)) return false;
        }
        if (q && !matchesQuery(i, q)) return false;
        return true;
      });
      if (list.length === 0) {
        grid.innerHTML = `<div class="empty">No icons found.</div>`;
        return;
      }
      const MAX_ICONS = 240;
      const shown = list.slice(0, MAX_ICONS);
      if (list.length > MAX_ICONS) {
        grid.dataset.more = String(list.length - MAX_ICONS);
      } else {
        delete grid.dataset.more;
      }
      grid.innerHTML = shown
        .map(
          (i) => `
          <button class="ip-item ${i.custom ? 'ip-custom' : ''} ${selected?.id === i.id ? 'selected' : ''}" data-key="${i.id}" title="${i.title}">
            <span class="svg-icon" data-src="${iconUrl(i)}"></span>
            ${i.custom ? '<span class="ip-custom-x">✕</span>' : ''}
          </button>`,
        )
        .join('');
      observeGrid();
      grid.querySelectorAll('.ip-item').forEach((b) => {
        b.addEventListener('click', (e) => {
          const key = Number(b.getAttribute('data-key'));
          const isCustom = (e.target as HTMLElement).closest('.ip-custom-x') !== null;
          if (isCustom) {
            removeCustomIcon(key);
            all = all.filter((x) => x.id !== key);
            if (selected?.id === key) {
              selected = null;
              pickBtn.disabled = true;
            }
            render();
            return;
          }
          selected = all.find((x) => x.id === key) ?? null;
          grid.querySelectorAll('.ip-item').forEach((x) => x.classList.remove('selected'));
          b.classList.add('selected');
          pickBtn.disabled = !selected;
        });
      });
    }

    search.addEventListener('input', () => {
      query = search.value;
      render();
    });

    function renderCats(): void {
      const entries = [{ category: 'All', total: all.length }, ...cats];
      catsEl.innerHTML = entries
        .map(
          (c) =>
            `<button class="ip-cat ${c.category === activeCat ? 'active' : ''}" data-cat="${c.category}">${c.category} <span>${c.total}</span></button>`,
        )
        .join('');
      catsEl.querySelectorAll('.ip-cat').forEach((b) => {
        b.addEventListener('click', () => {
          activeCat = b.getAttribute('data-cat')!;
          renderCats();
          render();
        });
      });
    }

    overlay.querySelectorAll('.ip-color').forEach((b) => {
      b.addEventListener('click', () => {
        color = b.getAttribute('data-color')!;
        applyColorButtons();
        // Re-render the whole grid so every icon is redrawn in the new color.
        render();
      });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));

    pickBtn.addEventListener('click', () => {
      if (!selected) return;
      overlay.remove();
      resolve({ url: iconUrl(selected), color });
    });

    // Custom SVG add modal
    overlay.querySelector('#ip-add')!.addEventListener('click', () => {
      const addOverlay = document.createElement('div');
      addOverlay.className = 'modal-overlay';
      addOverlay.innerHTML = `
        <div class="modal ip-add-modal">
          <h2>Add custom SVG</h2>
          <div class="form-field">
            <label>Name</label>
            <input id="ip-custom-name" placeholder="My icon" autocomplete="off" />
          </div>
          <div class="form-field">
            <label>SVG code</label>
            <textarea id="ip-custom-svg" rows="8" spellcheck="false" placeholder="<svg ...>...</svg>" style="font-family:ui-monospace,monospace;font-size:12px;resize:vertical"></textarea>
          </div>
          <div class="ip-custom-preview" id="ip-custom-preview"></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-close>Cancel</button>
            <button class="btn btn-primary" id="ip-custom-add" disabled>Add icon</button>
          </div>
        </div>
      `;
      document.body.appendChild(addOverlay);

      const svgInput = addOverlay.querySelector('#ip-custom-svg') as HTMLTextAreaElement;
      const nameInput = addOverlay.querySelector('#ip-custom-name') as HTMLInputElement;
      const preview = addOverlay.querySelector('#ip-custom-preview') as HTMLElement;
      const addBtn = addOverlay.querySelector('#ip-custom-add') as HTMLButtonElement;

      let valid = false;
      const update = () => {
        const text = svgInput.value.trim();
        valid = /<svg[\s>]/i.test(text) && /<\/svg>/i.test(text);
        addBtn.disabled = !valid;
        if (valid) {
          const uri = svgToDataUri(text, color);
          preview.innerHTML = `<img src="${uri}" alt="preview" width="48" height="48"/>`;
        } else {
          preview.innerHTML = '';
        }
      };
      svgInput.addEventListener('input', update);
      nameInput.addEventListener('input', update);

      addOverlay.addEventListener('click', (e) => {
        if (e.target === addOverlay) addOverlay.remove();
      });
      addOverlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => addOverlay.remove()));

      addBtn.addEventListener('click', () => {
        if (!valid) return;
        const icon = addCustomIcon(svgInput.value, nameInput.value);
        all.unshift(icon);
        renderCats();
        selected = icon;
        pickBtn.disabled = false;
        render();
        addOverlay.remove();
      });
      document.body.appendChild(addOverlay);
    });

    (async () => {
      try {
        const [remote, categories] = await Promise.all([fetchIcons(), fetchCategories()]);
        all = [...loadCustomIcons(), ...remote];
        cats = categories.filter((c) => c.category !== 'Custom');
        renderCats();
        applyColorButtons();
        render();
      } catch (err) {
        // offline: still show custom icons
        all = loadCustomIcons();
        cats = [];
        renderCats();
        render();
      }
    })();
  });
}

