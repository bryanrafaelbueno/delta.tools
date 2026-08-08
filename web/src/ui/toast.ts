export function toast(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  let wrap = document.querySelector('.toast-wrap') as HTMLElement;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = message;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 200ms';
    setTimeout(() => t.remove(), 220);
  }, 3200);
}

export function openModal(html: string, onClose?: () => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => {
    overlay.remove();
    onClose?.();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]')?.addEventListener('click', close);
  return overlay;
}
