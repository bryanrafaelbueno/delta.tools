import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { renderSidebar, updateSidebarAuth, updateSidebarFavorites } from './ui/shell';
import { parseHash, type Route } from './router';
import { registerBuiltinConverters } from './converters';
import { registry } from './converters/registry';
import { state } from './state';
import { api } from './api';
import { renderDashboard } from './views/dashboard';
import { renderMarketplace } from './views/marketplace';
import { renderTools } from './views/tools';
import { renderSettings } from './views/settings';
import { renderAuth } from './views/auth';
import { renderProfile } from './views/profile';
import { renderTool } from './views/tool';
import { renderPlugin } from './views/plugin';
import { pluginManager } from './plugins/manager';

const app = document.getElementById('app')!;

function renderShell(): void {
  app.innerHTML = '';
  const sidebar = renderSidebar();
  const main = document.createElement('div');
  main.className = 'main';
  const content = document.createElement('div');
  content.className = 'content';
  content.id = 'content';
  main.appendChild(content);
  app.appendChild(sidebar);
  app.appendChild(main);
}

function routeContent(route: Route): HTMLElement {
  switch (route.name) {
    case 'home':
      return renderDashboard();
    case 'marketplace':
      return renderMarketplace();
    case 'tools':
      return renderTools();
    case 'settings':
      return renderSettings();
    case 'auth':
      return renderAuth();
    case 'profile':
      return renderProfile();
    case 'tool':
      return renderTool(route.id);
    case 'plugin':
      return renderPlugin(route.id);
    case 'recent':
      return renderTool(route.id);
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
  await pluginManager.loadAll();

  state.subscribe(() => {
    updateSidebarAuth();
    updateSidebarFavorites();
  });

  window.addEventListener('hashchange', render);
  render();

  if (state.token) {
    api.me().catch(() => state.setAuth(null, null));
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

  window.addEventListener('delta:search', ((e: CustomEvent) => {
    const q = String(e.detail || '').toLowerCase();
    const input = document.getElementById('hero-search-input') as HTMLInputElement | null;
    if (input) input.value = e.detail;
    if (!q) return;
    const match = registry
      .all()
      .map((c) => c.def)
      .find(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          `${d.from}->${d.to}`.includes(q),
      );
    if (match) window.location.hash = `/tool/${match.id}`;
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
    n.classList.toggle('active', href === active || (route.name === 'tool' && href === '/tools'));
  });
}

boot();
