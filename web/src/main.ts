import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { renderSidebar, updateSidebarAuth, updateSidebarFavorites } from './ui/shell';
import { parseHash, type Route } from './router';
import { registerBuiltinConverters } from './converters';
import { state } from './state';
import { api } from './api';
import { icon, logo } from './ui/icons';
import { renderDashboard } from './views/dashboard';
import { renderMarketplace } from './views/marketplace';
import { renderMyPlugins } from './views/myplugins';
import { renderSettings } from './views/settings';
import { renderAuth } from './views/auth';
import { renderProfile } from './views/profile';
import { renderModeration } from './views/moderation';
import { renderTool } from './views/tool';
import { renderPlugin } from './views/plugin';
import { renderBrowse } from './views/browse';
import { pluginManager } from './plugins/manager';

const app = document.getElementById('app')!;

function renderShell(): void {
  app.innerHTML = '';
  // Mobile-only top bar (hidden on desktop via CSS). On small screens the
  // sidebar becomes a drawer opened from here, so navigation stays usable.
  const topbar = document.createElement('div');
  topbar.className = 'mobile-topbar';
  topbar.innerHTML = `
    <button class="menu-btn" id="menu-btn" aria-label="Open menu">${icon('menu')}</button>
    <div class="mobile-logo" data-route="/">${logo()}<span>Delta.tools</span></div>
    <span style="flex:1"></span>
    <button class="menu-btn" id="menu-theme" aria-label="Toggle theme">${icon('sun')}</button>
  `;
  const sidebar = renderSidebar();
  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-backdrop';
  backdrop.hidden = true;
  const main = document.createElement('div');
  main.className = 'main';
  const content = document.createElement('div');
  content.className = 'content';
  content.id = 'content';
  main.appendChild(content);
  app.appendChild(topbar);
  app.appendChild(sidebar);
  app.appendChild(backdrop);
  app.appendChild(main);

  const openMenu = (): void => {
    sidebar.classList.add('open');
    backdrop.hidden = false;
  };
  const closeMenu = (): void => {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
  };
  topbar.querySelector('#menu-btn')!.addEventListener('click', openMenu);
  topbar.querySelector('.mobile-logo')!.addEventListener('click', () => {
    window.location.hash = '/';
  });
  topbar.querySelector('#menu-theme')!.addEventListener('click', () => {
    state.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  // Navigating re-renders the shell (fresh sidebar without .open), so the
  // drawer closes by itself on every route change.
  backdrop.addEventListener('click', closeMenu);
}

function routeContent(route: Route): HTMLElement {
  switch (route.name) {
    case 'home':
      return renderDashboard();
    case 'marketplace':
      return renderMarketplace();
    case 'tools':
      return renderMyPlugins(route.tab ?? 'favorites');
    case 'settings':
      return renderSettings();
    case 'auth':
      return renderAuth();
    case 'profile':
      return renderProfile();
    case 'moderation':
      return renderModeration();
    case 'tool':
      return renderTool(route.id);
    case 'plugin':
      return renderPlugin(route.id);
    case 'recent':
      return renderTool(route.id);
    case 'browse':
      return renderBrowse(route.category);
  }
}

async function loadFavorites(): Promise<void> {
  if (!state.token) return;
  try {
    const res = await api.listFavorites();
    state.setFavorites(res.favorites);
  } catch {
    // offline / server down: keep whatever we have
  }
}

async function boot(): Promise<void> {
  document.documentElement.dataset.theme = state.theme;
  registerBuiltinConverters();

  // Render the shell BEFORE any async work. Awaiting IndexedDB (plugins) or a
  // network call before the first paint left #app empty on a black background
  // whenever a restore or cache hiccup delayed/blocked boot (black screen that
  // only a hard reload could fix). The app must always paint immediately.
  state.subscribe(() => {
    updateSidebarAuth();
    updateSidebarFavorites();
  });

  window.addEventListener('hashchange', render);
  render();

  // Chrome may restore cross-origin-isolated pages from bfcache after a
  // reload/navigation; the frozen DOM stays but event handlers are gone, so
  // re-render to rebuild a live shell.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) render();
  });

  try {
    await pluginManager.loadAll();
  } catch (err) {
    console.error('Failed to load installed plugins:', err);
  }

  if (state.token) {
    api
      .me()
      .then((res) => state.setUser(res.user as never))
      .catch(() => state.setAuth(null, null));
    loadFavorites();
  }

  window.addEventListener('delta:auth', () => {
    loadFavorites();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      const input = document.getElementById('hero-search-input') as HTMLInputElement | null;
      if (input && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    }
  });

  window.addEventListener('delta:recent', ((e: CustomEvent) => {
    window.location.hash = `/tool/recent-${e.detail}`;
  }) as EventListener);
}

function render(): void {
  const route = parseHash(window.location.hash);
  renderShell();
  const content = document.getElementById('content')!;
  const node = routeContent(route);
  content.appendChild(node);

  // highlight active nav
  const active = route.name === 'home' ? '/' : `/${route.name}`;
  document.querySelectorAll('.nav-item[data-route]').forEach((n) => {
    const href = (n as HTMLElement).dataset.route;
    let isActive: boolean;
    if (route.name === 'tools') {
      // one page with two tabs: only the matching sidebar item is highlighted
      isActive = route.tab === 'manage' ? href === '/manage' : href === '/tools';
    } else if (route.name === 'tool') {
      isActive = href === '/tools' || href === '/manage';
    } else {
      isActive = href === active;
    }
    n.classList.toggle('active', isActive);
  });
}

boot();

// Last-resort guard: if anything throws before the first render, show a
// recoverable screen instead of a black page (only fixable with shift+F5).
window.addEventListener('error', () => {
  if (!document.getElementById('content')?.children.length && !app.children.length) {
    app.innerHTML = `
      <div style="margin:auto;max-width:420px;text-align:center;display:flex;flex-direction:column;gap:12px;padding:24px">
        <div class="page-title">Delta.tools failed to start</div>
        <div class="page-sub">Something went wrong while loading the app. Try reloading — your files are never uploaded, so nothing is lost.</div>
        <button class="btn btn-primary" style="margin:auto" onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
});
