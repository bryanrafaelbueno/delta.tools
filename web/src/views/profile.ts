import { state } from '../state';
import { toast } from '../ui/toast';

export function renderProfile(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '16px';

  if (!state.user) {
    el.innerHTML = `
      <div class="page-title">Profile</div>
      <div class="page-sub">You need to sign in first.</div>
      <div class="panel" style="max-width:400px">
        <button class="btn btn-primary" id="go-auth">Go to sign in</button>
      </div>
    `;
    el.querySelector('#go-auth')!.addEventListener('click', () => (window.location.hash = '/auth'));
    return el;
  }

  const user = state.user;

  el.innerHTML = `
    <div>
      <div class="page-title">Profile</div>
      <div class="page-sub">Your Delta.tools account.</div>
    </div>
    <div class="panel" style="max-width:520px;display:flex;gap:18px;align-items:center">
      <div class="avatar" style="width:56px;height:56px;font-size:22px;border-radius:14px;background:var(--hover-strong);color:var(--text);display:flex;align-items:center;justify-content:center;font-weight:700">${user.username[0].toUpperCase()}</div>
      <div>
        <div style="font-size:17px;font-weight:700">${user.username}</div>
        <div style="color:var(--text-muted);font-size:12.5px">${user.role ? `${user.role} · ` : ''}member since ${new Date(user.created_at).toLocaleDateString()}</div>
      </div>
    </div>
    <div class="panel" style="max-width:520px">
      <div class="setting-row">
        <div>
          <div class="s-title">Installed plugins</div>
          <div class="s-desc">Managed in Your tools.</div>
        </div>
        <a class="btn btn-ghost" href="#/tools" style="padding:6px 12px;font-size:12px;text-decoration:none">Manage</a>
      </div>
      <div class="setting-row">
        <div>
          <div class="s-title">Sign out</div>
          <div class="s-desc">Your installed plugins stay on this device.</div>
        </div>
        <button class="btn btn-danger" id="btn-signout" style="padding:6px 12px;font-size:12px">Sign out</button>
      </div>
    </div>
  `;

  el.querySelector('#btn-signout')!.addEventListener('click', () => {
    state.setAuth(null, null);
    toast('Signed out', 'success');
    window.location.hash = '/';
  });

  return el;
}
