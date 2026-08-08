import { state } from '../state';
import { icon, logo } from './icons';
import { registry } from '../converters/registry';

export function renderSidebar(): HTMLElement {
  const el = document.createElement('aside');
  el.className = 'sidebar';

  const installed = registry.all().filter((c) => c.def.source === 'plugin').length;
  const recent = [
    ['youtube', 'Youtube Downloader'],
    ['mp3-wav', 'Mp3 to WAV'],
    ['resize', 'Resize Images'],
  ] as const;

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
      <div class="nav-label">Menu</div>
      <div class="nav-item" data-route="/">${icon('home')} <span>Dashboard</span></div>
      <div class="nav-item" data-route="/marketplace">${icon('store')} <span>Marketplace</span></div>
      <div class="nav-item" data-route="/tools">${icon('wrench')} <span>Your tools</span>
        <span class="badge accent" id="installed-count">${installed}</span>
      </div>
      <div class="nav-label">Recents</div>
      ${recent.map(([id, name]) => `<div class="nav-item nested" data-recent="${id}">${icon('arrow')} <span>${name}</span></div>`).join('')}
    </div>
    <div class="sidebar-section">
      <div class="nav-item" data-action="theme">${icon('sun')} <span>Theme</span></div>
      <div class="nav-item" data-route="/settings">${icon('settings')} <span>Settings</span></div>
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
    });
  });

  el.querySelectorAll('[data-recent]').forEach((node) => {
    node.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('delta:recent', { detail: (node as HTMLElement).dataset.recent }));
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

export function renderTopbar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'topbar';
  el.innerHTML = `
    <div class="topbar-search">
      ${icon('search')}
      <input type="text" id="global-search" placeholder="Search for some tool..." />
      <span class="slash">/</span>
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" id="btn-theme" title="Toggle theme">${state.theme === 'dark' ? icon('moon') : icon('sun')}</button>
      <button class="icon-btn" id="btn-github" title="Open source">${icon('code')}</button>
    </div>
  `;
  el.querySelector('#btn-theme')!.addEventListener('click', () => {
    state.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  el.querySelector('#btn-github')!.addEventListener('click', () => {
    window.open('https://github.com/bryanrafaelbueno/delta.tools', '_blank');
  });
  return el;
}
