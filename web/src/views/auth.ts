import { api } from '../api';
import { state } from '../state';
import { toast } from '../ui/toast';

export function renderAuth(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.flex = '1';

  let mode: 'login' | 'register' = 'login';

  el.innerHTML = `
    <div class="panel auth-card">
      <div class="page-title" style="text-align:center">Welcome to Delta.tools</div>
      <div class="page-sub" style="text-align:center;margin-bottom:16px">Sign in to publish plugins and sync your tools.</div>
      <div class="auth-tabs">
        <button data-mode="login" class="active">Sign in</button>
        <button data-mode="register">Create account</button>
      </div>
      <div style="height:16px"></div>
      <form id="auth-form">
        <div class="form-field" style="margin-bottom:10px">
          <label>Username</label>
          <input id="auth-username" autocomplete="username" required />
        </div>
        <div class="form-field" style="margin-bottom:6px">
          <label>Password</label>
          <input id="auth-password" type="password" autocomplete="current-password" required />
        </div>
        <div class="auth-error" id="auth-error"></div>
        <button class="btn btn-primary" id="auth-submit" style="width:100%;margin-top:8px" type="submit">Sign in</button>
      </form>
      <div class="page-sub" style="text-align:center;margin-top:14px;font-size:11.5px;color:var(--text-muted)">
        Conversions always run in your browser — accounts are only used for the marketplace.
      </div>
    </div>
  `;

  const tabs = el.querySelector('.auth-tabs')!;
  const errorEl = el.querySelector('#auth-error') as HTMLElement;
  const submit = el.querySelector('#auth-submit') as HTMLButtonElement;
  const form = el.querySelector('#auth-form') as HTMLFormElement;

  tabs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    mode = btn.dataset.mode as 'login' | 'register';
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    submit.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    (el.querySelector('#auth-password') as HTMLInputElement).autocomplete =
      mode === 'login' ? 'current-password' : 'new-password';
    errorEl.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (el.querySelector('#auth-username') as HTMLInputElement).value.trim();
    const password = (el.querySelector('#auth-password') as HTMLInputElement).value;
    errorEl.textContent = '';
    submit.disabled = true;
    submit.textContent = '…';
    try {
      const res =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password);
      state.setAuth(res.token, res.user as never);
      toast(mode === 'login' ? `Welcome back, ${username}!` : `Account created, ${username}!`, 'success');
      window.location.hash = '/';
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    }
  });

  return el;
}
