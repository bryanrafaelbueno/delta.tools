export type Route =
  | { name: 'home' }
  | { name: 'marketplace' }
  | { name: 'tools' }
  | { name: 'manage' }
  | { name: 'settings' }
  | { name: 'auth' }
  | { name: 'profile' }
  | { name: 'moderation' }
  | { name: 'tool'; id: string }
  | { name: 'plugin'; id: string }
  | { name: 'recent'; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case undefined:
    case '':
      return { name: 'home' };
    case 'marketplace':
      return { name: 'marketplace' };
    case 'tools':
      return { name: 'tools' };
    case 'manage':
      return { name: 'manage' };
    case 'settings':
      return { name: 'settings' };
    case 'auth':
      return { name: 'auth' };
    case 'profile':
      return { name: 'profile' };
    case 'moderation':
      return { name: 'moderation' };
    case 'tool':
      return { name: 'tool', id: parts[1] ?? '' };
    case 'plugin':
      return { name: 'plugin', id: parts[1] ?? '' };
    default:
      return { name: 'home' };
  }
}

export function navigate(route: string): void {
  window.location.hash = route;
}
