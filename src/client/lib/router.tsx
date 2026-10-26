import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

interface Loc {
  path: string;
  search: URLSearchParams;
  hash: string;
}
const read = (): Loc => ({ path: window.location.pathname, search: new URLSearchParams(window.location.search), hash: window.location.hash.slice(1) });
const RouterCtx = createContext<Loc>(read());

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event('fs:navigate'));
  const hash = to.split('#')[1];
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }), 50);
  else window.scrollTo(0, 0);
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener('popstate', on);
    window.addEventListener('fs:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('fs:navigate', on);
    };
  }, []);
  // Move focus to the main heading on navigation so screen-reader users hear the new page.
  useEffect(() => {
    const h = document.querySelector('main h1') as HTMLElement | null;
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }, [loc.path]);
  return <RouterCtx.Provider value={loc}>{children}</RouterCtx.Provider>;
}

export const useLocation = () => useContext(RouterCtx);

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const loc = useLocation();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (/^https?:/.test(to)) return;
    e.preventDefault();
    navigate(to);
  };
  const current = to.split(/[?#]/)[0] === loc.path;
  return (
    <a href={to} {...rest} onClick={onClick} aria-current={rest['aria-current'] ?? (current ? 'page' : undefined)}>
      {children}
    </a>
  );
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}
