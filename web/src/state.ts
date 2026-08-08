import type { User } from './types';

const TOKEN_KEY = 'delta_token';
const THEME_KEY = 'delta_theme';

class State {
  user: User | null = null;
  favorites: string[] = [];
  listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setAuth(token: string | null, user: User | null): void {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    this.user = user;
    if (!token) this.favorites = [];
    this.notify();
  }

  setUser(user: User | null): void {
    this.user = user;
    this.notify();
  }

  setFavorites(ids: string[]): void {
    this.favorites = ids;
    this.notify();
  }

  isFavorite(toolId: string): boolean {
    return this.favorites.includes(toolId);
  }

  get theme(): 'dark' | 'light' {
    return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark';
  }

  setTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    this.notify();
  }
}

export const state = new State();
