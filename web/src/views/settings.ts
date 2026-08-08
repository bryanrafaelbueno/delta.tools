import { state } from '../state';
import { toast } from '../ui/toast';

export function renderSettings(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  el.innerHTML = `
    <div>
      <div class="page-title">Settings</div>
      <div class="page-sub">Delta.tools never uploads your files. Here's what you can tweak.</div>
    </div>
    <div class="panel" style="max-width:640px">
      <div class="setting-row">
        <div>
          <div class="s-title">Dark theme</div>
          <div class="s-desc">Fits the Delta look. Files never leave this device either way.</div>
        </div>
        <button class="toggle ${state.theme === 'dark' ? 'on' : ''}" id="toggle-theme" role="switch"></button>
      </div>
      <div class="setting-row">
        <div>
          <div class="s-title">Clear conversion history</div>
          <div class="s-desc">Remove stored settings and plugin cache.</div>
        </div>
        <button class="btn btn-danger" id="btn-clear" style="padding:6px 12px;font-size:12px">Clear data</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="s-title">About</div>
          <div class="s-desc">Delta.tools v1.0.0 — open source, no ads, no tracking.</div>
        </div>
        <a class="btn btn-ghost" href="https://github.com/bryanrafaelbueno/delta.tools" target="_blank" style="padding:6px 12px;font-size:12px;text-decoration:none">GitHub</a>
      </div>
    </div>
  `;

  const toggle = el.querySelector('#toggle-theme') as HTMLButtonElement;
  toggle.addEventListener('click', () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    state.setTheme(next);
    toggle.classList.toggle('on', next === 'dark');
  });

  el.querySelector('#btn-clear')!.addEventListener('click', async () => {
    localStorage.removeItem('delta_token');
    localStorage.removeItem('delta_theme');
    indexedDB.deleteDatabase('delta-plugins');
    state.setAuth(null, null);
    toast('Local data cleared', 'success');
    setTimeout(() => window.location.reload(), 600);
  });

  return el;
}
