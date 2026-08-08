const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = localStorage.getItem('delta_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: unknown }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user: unknown }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: unknown }>('/auth/me'),

  listPlugins: () => request<{ plugins: unknown[] }>('/plugins'),

  getPlugin: (id: string) => request<{ plugin: unknown }>(`/plugins/${encodeURIComponent(id)}`),

  installPlugin: (id: string) =>
    request<{ ok: boolean }>(`/plugins/${encodeURIComponent(id)}/install`, { method: 'POST' }),

  publishPlugin: (manifest: unknown) =>
    request<{ plugin: unknown }>('/plugins', {
      method: 'POST',
      body: JSON.stringify(manifest),
    }),
};
