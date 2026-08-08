import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { renderSidebar, updateSidebarAuth, updateSidebarFavorites } from './ui/shell';
import { parseHash, type Route } from './router';
import { registerBuiltinConverters } from './converters';
import { state } from './state';
import { api } from './api';
import { renderDashboard } from './views/dashboard';
import { renderMarketplace } from './views/marketplace';
import { renderMyPlugins } from './views/myplugins';
import { renderSettings } from './views/settings';
import { renderAuth } from './views/auth';
import { renderProfile } from './views/profile';
import { renderModeration } from './views/moderation';
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
    n.classList.toggle(
      'active',
      href === active ||
        (route.name === 'tools' && href === '/tools' && route.tab !== 'manage') ||
        (route.name === 'tools' && href === '/manage' && route.tab === 'manage') ||
        (route.name === 'tool' && (href === '/tools' || href === '/manage')),
    );
  });
}

boot();
