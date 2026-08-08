import { state } from '../state';
import { icon, logo } from './icons';
import { registry } from '../converters/registry';

export function renderSidebar(): HTMLElement {
  const el = document.createElement('aside');
  el.className = 'sidebar';

  const favorites = state.favorites
    .map((id) => registry.get(id))
    .filter((c) => c !== undefined)
    .map((c) => c.def)
    .slice(0, 8);

  el.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-logo" data-route="/">
        ${logo()}
        <span>Delta.tools</span>
      </div>
      <div class="sidebar-search" data-route="/" title="Search">
        ${icon('search')}
        <span>Search</span>
        <span class="slash">/</span>
      </div>
      <div class="nav-item" data-route="/">${icon('home')} <span>Dashboard</span></div>
      <div class="nav-item" data-route="/marketplace">${icon('store')} <span>Marketplace</span></div>
      <div class="nav-separator"></div>
      <div class="nav-item" data-route="/tools">${icon('star')} <span>Favorite Tools</span>
        <span class="badge accent" id="favorites-count">${state.token ? favorites.length : ''}</span>
      </div>
      <div id="sidebar-favorites">
        ${
          state.token
            ? favorites.length
              ? favorites
                  .map((d) => `<div class="nav-item nested" data-tool="${d.id}"><span class="fav-icon">${d.icon}</span> <span>${d.name}</span></div>`)
                  .join('')
              : '<div class="nav-item nested muted" data-route="/tools">No favorites yet — star a tool</div>'
            : '<div class="nav-item nested muted" data-route="/auth">Sign in to save favorites</div>'
        }
      </div>
    </div>    <div class="sidebar-section">
      <div class="nav-item" data-action="theme">${icon('sun')} <span>Theme</span></div>
      <div class="nav-item" data-route="/settings">${icon('settings')} <span>Settings</span></div>
      <div class="nav-separator"></div>
      <div class="nav-profile" id="profile" data-route="${state.token ? '/profile' : '/auth'}">
        <div class="avatar" id="profile-avatar">${state.user ? state.user.username[0].toUpperCase() : '?'}</div>
        <div class="who">
          <div class="name" id="profile-name">${state.user ? state.user.username : 'Sign in'}</div>
          <div class="role" id="profile-role">${state.user ? state.user.role : 'Guest'}</div>
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll('[data-route]').forEach((node) => {
    node.addEventListener('click', () => {
      window.location.hash = (node as HTMLElement).dataset.route!;
      if (node.classList.contains('sidebar-search')) {
        setTimeout(() => {
          const input = document.getElementById('hero-search-input') as HTMLInputElement | null;
          input?.focus();
        }, 0);
      }
    });
  });

  el.querySelectorAll('[data-tool]').forEach((node) => {
    node.addEventListener('click', () => {
      const tool = (node as HTMLElement).dataset.tool!;
      const conv = registry.get(tool);
      window.location.hash = conv ? `/tool/${tool}` : '/';
    });
  });

  el.querySelector('[data-action="theme"]')!.addEventListener('click', () => {
    state.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  return el;
}

export function updateSidebarAuth(): void {
  const avatar = document.getElementById('profile-avatar');
  const name = document.getElementById('profile-name');
  const role = document.getElementById('profile-role');
  const profile = document.getElementById('profile');
  if (avatar && name && role && profile) {
    if (state.user) {
      avatar.textContent = state.user.username[0].toUpperCase();
      name.textContent = state.user.username;
      role.textContent = state.user.role;
    } else {
      avatar.textContent = '?';
      name.textContent = 'Sign in';
      role.textContent = 'Guest';
    }
    profile.dataset.route = state.token ? '/profile' : '/auth';
  }
}

export function updateSidebarFavorites(): void {
  const badge = document.getElementById('favorites-count');
  if (badge) badge.textContent = state.token ? String(state.favorites.length) : '';
  const list = document.getElementById('sidebar-favorites');
  if (!list) return;
  const favorites = state.favorites
    .map((id) => registry.get(id))
    .filter((c) => c !== undefined)
    .map((c) => c.def)
    .slice(0, 8);
  list.innerHTML = favorites.length
    ? favorites
        .map((d) => `<div class="nav-item nested" data-tool="${d.id}"><span class="fav-icon">${d.icon}</span> <span>${d.name}</span></div>`)
        .join('')
    : '<div class="nav-item nested muted" data-route="/tools">No favorites yet — star a tool</div>';
  list.querySelectorAll('[data-tool]').forEach((node) => {
    node.addEventListener('click', () => {
      const tool = (node as HTMLElement).dataset.tool!;
      const conv = registry.get(tool);
      window.location.hash = conv ? `/tool/${tool}` : '/';
    });
  });
  list.querySelectorAll('[data-route]').forEach((node) => {
    node.addEventListener('click', () => {
      window.location.hash = (node as HTMLElement).dataset.route!;
    });
  });
}

export function isLoggedIn(): boolean {
  return state.token !== null;
}
