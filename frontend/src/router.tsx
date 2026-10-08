import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

// Roteador mínimo baseado na History API.
type Location = { pathname: string; search: URLSearchParams; hash: string };

const read = (): Location => ({
  pathname: window.location.pathname,
  search: new URLSearchParams(window.location.search),
  hash: window.location.hash,
});

const RouterContext = createContext<Location>(read());

export function navigate(to: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
  if (to === window.location.pathname + window.location.search + window.location.hash) return;
  window.history[opts.replace ? "replaceState" : "pushState"]({}, "", to);
  window.dispatchEvent(new Event("app:navigate"));
  const hash = to.split("#")[1];
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }));
  else if (opts.scroll !== false) window.scrollTo({ top: 0 });
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const update = () => setLoc(read());
    window.addEventListener("popstate", update);
    window.addEventListener("app:navigate", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("app:navigate", update);
    };
  }, []);
  return <RouterContext value={loc}>{children}</RouterContext>;
}

export const useLocation = () => useContext(RouterContext);

// Casa "/produtos/:slug" com o caminho atual.
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) params[p[i]!.slice(1)] = decodeURIComponent(a[i]!);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { pathname } = useLocation();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target) return;
    e.preventDefault();
    navigate(to);
  };
  const current = to.split(/[?#]/)[0] === pathname && !to.includes("#") ? "page" : undefined;
  return <a href={to} onClick={handle} aria-current={current} {...rest} />;
}
