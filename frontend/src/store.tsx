import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setAuthToken, type Cart, type User } from "./api";

// Estado global: sessão, carrinho, favoritos e avisos (toasts).

const TOKEN_KEY = "eds.token";
const CART_KEY = "eds.cart";

const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* modo privado */ } },
};

type Toast = { id: number; message: string; kind?: "ok" | "error"; href?: string; hrefLabel?: string };

type Store = {
  user: User | null;
  ready: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  cart: Cart | null;
  cartCount: number;
  addToCart: (productId: number, mode: "unit" | "box", quantity?: number) => Promise<void>;
  setCartQty: (productId: number, mode: "unit" | "box", quantity: number) => Promise<void>;
  refreshCart: () => Promise<void>;
  clearCartToken: () => void;
  favorites: Set<number>;
  toggleFavorite: (productId: number) => Promise<boolean>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.kind === "error" ? 6000 : 4200);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);

  const loadFavorites = useCallback(async () => {
    try {
      const { items } = await api<{ items: { id: number }[] }>("/me/favorites");
      setFavorites(new Set(items.map((p) => p.id)));
    } catch { setFavorites(new Set()); }
  }, []);

  // Restaura a sessão salva.
  useEffect(() => {
    const token = storage.get(TOKEN_KEY);
    if (!token) { setReady(true); return; }
    setAuthToken(token);
    api<{ user: User }>("/auth/me")
      .then(({ user }) => { setUser(user); loadFavorites(); })
      .catch(() => { storage.set(TOKEN_KEY, null); setAuthToken(null); })
      .finally(() => setReady(true));
  }, [loadFavorites]);

  const refreshCart = useCallback(async () => {
    const token = storage.get(CART_KEY);
    if (!token) { setCart(null); return; }
    try { setCart(await api<Cart>(`/cart/${token}`)); }
    catch (e) { if (e instanceof ApiError && e.status === 404) { storage.set(CART_KEY, null); setCart(null); } }
  }, []);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const ensureCart = useCallback(async () => {
    const existing = storage.get(CART_KEY);
    if (existing) return existing;
    const created = await api<Cart>("/cart", { method: "POST" });
    storage.set(CART_KEY, created.token);
    return created.token;
  }, []);

  const setCartQty = useCallback(async (productId: number, mode: "unit" | "box", quantity: number) => {
    const token = await ensureCart();
    try {
      setCart(await api<Cart>(`/cart/${token}/items`, { method: "PUT", body: { productId, mode, quantity } }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { storage.set(CART_KEY, null); return setCartQty(productId, mode, quantity); }
      throw e;
    }
  }, [ensureCart]);

  const addToCart = useCallback(async (productId: number, mode: "unit" | "box", quantity = 1) => {
    const current = cart?.lines.find((l) => l.product.id === productId && l.mode === mode)?.quantity ?? 0;
    await setCartQty(productId, mode, current + quantity);
  }, [cart, setCartQty]);

  const login = useCallback((token: string, u: User) => {
    storage.set(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(u);
    loadFavorites();
  }, [loadFavorites]);

  const logout = useCallback(() => {
    storage.set(TOKEN_KEY, null);
    setAuthToken(null);
    setUser(null);
    setFavorites(new Set());
  }, []);

  const clearCartToken = useCallback(() => { storage.set(CART_KEY, null); setCart(null); }, []);

  const toggleFavorite = useCallback(async (productId: number) => {
    const on = !favorites.has(productId);
    await api(`/me/favorites/${productId}`, { method: on ? "PUT" : "DELETE" });
    setFavorites((s) => { const n = new Set(s); on ? n.add(productId) : n.delete(productId); return n; });
    return on;
  }, [favorites]);

  const cartCount = cart?.lines.reduce((acc, l) => acc + l.quantity, 0) ?? 0;

  const value = useMemo<Store>(() => ({
    user, ready, login, logout, cart, cartCount, addToCart, setCartQty, refreshCart, clearCartToken,
    favorites, toggleFavorite, toasts, toast, dismiss,
  }), [user, ready, login, logout, cart, cartCount, addToCart, setCartQty, refreshCart, clearCartToken, favorites, toggleFavorite, toasts, toast, dismiss]);

  return <StoreContext value={value}>{children}</StoreContext>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore fora do StoreProvider");
  return s;
}

// Busca simples com estado de carregamento/erro; refaz quando `key` muda.
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e : new ApiError(0, "network", "Falha de conexão")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);
  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
