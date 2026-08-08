import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { renderSidebar, renderTopbar, updateSidebarAuth } from './ui/shell';
import { parseHash, type Route } from './router';
import { registerBuiltinConverters } from './converters';
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
  main.appendChild(renderTopbar());
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

async function boot(): Promise<void> {
  document.documentElement.dataset.theme = state.theme;
  registerBuiltinConverters();
  await pluginManager.loadAll();

  state.subscribe(() => {
    updateSidebarAuth();
    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) themeBtn.innerHTML = state.theme === 'dark' ? iconByName('moon') : iconByName('sun');
  });

  window.addEventListener('hashchange', render);
  render();

  if (state.token) {
    api.me().catch(() => state.setAuth(null, null));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '/') {
      const input = document.getElementById('global-search') as HTMLInputElement | null;
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
    const input = document.getElementById('global-search') as HTMLInputElement | null;
    if (input) input.value = e.detail;
    const grid = document.getElementById('tool-grid');
    if (grid) {
      grid.dispatchEvent(new CustomEvent('delta:filter', { detail: e.detail }));
    }
  }) as EventListener);
}

function iconByName(name: string): string {
  // small local copy to avoid circular import
  const icons: Record<string, string> = {
    sun: '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
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
