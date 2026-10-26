import { useEffect, useState } from 'react';

export type Route =
  | { name: 'generate' }
  | { name: 'dashboard' }
  | { name: 'history' }
  | { name: 'help' }
  | { name: 'request'; id: string }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/generate') return { name: 'generate' };
  if (path === '/dashboard') return { name: 'dashboard' };
  if (path === '/history') return { name: 'history' };
  if (path === '/help') return { name: 'help' };
  const match = /^\/requests\/([A-Za-z0-9-]+)$/.exec(path);
  if (match) return { name: 'request', id: match[1] };
  return { name: 'notfound' };
}

let inAppNavigations = 0;

/** True once the user has moved between screens, so "Back" stays inside the app. */
export function canGoBack(): boolean {
  return inAppNavigations > 0;
}

export function navigate(path: string): void {
  if (window.location.hash !== `#${path}`) window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      inAppNavigations++;
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
