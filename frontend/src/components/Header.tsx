import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { brl } from "../format";
import { BrandMark, Icon } from "../icons";
import { Link, navigate, useLocation } from "../router";
import { useDebounced, useStore } from "../store";

const NAV = [
  { to: "/produtos", label: "Produtos" },
  { to: "/nossa-historia", label: "Nossa história" },
  { to: "/atacado", label: "Atacado" },
];

type Suggest = {
  products: { slug: string; name: string; imageUrl: string | null; producerName: string; priceCents: number }[];
  producers: { slug: string; name: string; city: string; state: string }[];
  categories: { slug: string; name: string }[];
};

// Busca no padrão combobox: o foco fica no campo e as setas movem a opção ativa.
function Search() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggest | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 200);

  useEffect(() => {
    if (term.length < 2) { setData(null); return; }
    let alive = true;
    api<Suggest>(`/search/suggest?q=${encodeURIComponent(term)}`).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [term]);

  const items = [
    ...(data?.products ?? []).map((p) => ({ key: `p${p.slug}`, to: `/produtos/${p.slug}`, title: p.name, sub: `${p.producerName} · ${brl(p.priceCents)}`, img: p.imageUrl, group: "Produtos" })),
    ...(data?.producers ?? []).map((p) => ({ key: `r${p.slug}`, to: `/produtos?produtor=${p.slug}`, title: p.name, sub: `${p.city}, ${p.state}`, img: null, group: "Produtores" })),
    ...(data?.categories ?? []).map((c) => ({ key: `c${c.slug}`, to: `/produtos?categoria=${c.slug}`, title: c.name, sub: "Categoria", img: null, group: "Categorias" })),
  ];
  if (items.length) items.push({ key: "all", to: `/produtos?q=${encodeURIComponent(term)}`, title: `Ver todos os resultados para “${term}”`, sub: "", img: null, group: "" });

  const expanded = open && term.length >= 2 && !!data;
  const go = (to: string) => { setOpen(false); setQ(""); input.current?.blur(); navigate(to); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) go(item.to);
      else if (q.trim()) go(`/produtos?q=${encodeURIComponent(q.trim())}`);
    }
  };

  let lastGroup = "";
  return (
    <div className="search" role="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label className="search-box">
        <Icon name="search" />
        <span className="sr-only">Buscar produtos</span>
        <input ref={input} value={q} placeholder="Buscar queijos, doces, produtores…" type="search"
          role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls="search-panel"
          aria-activedescendant={expanded && active >= 0 ? `search-opt-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      </label>
      <span className="sr-only" role="status">{expanded ? (items.length ? `${items.length - 1} sugestões. Use as setas para navegar.` : "Nenhuma sugestão.") : ""}</span>
      {expanded && (
        <div className="search-panel" id="search-panel" role="listbox" aria-label="Sugestões">
          {items.length === 0 && <p className="search-empty">Nada encontrado para “{term}”.</p>}
          {items.map((it, i) => {
            const header = it.group && it.group !== lastGroup ? <div className="search-group" role="presentation">{(lastGroup = it.group)}</div> : null;
            return (
              <div key={it.key} role="presentation">
                {header}
                <div id={`search-opt-${i}`} className="search-item" role="option" aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => go(it.to)}>
                  {it.img ? <img src={it.img} alt="" /> : <span className="icon-circle"><Icon name={it.group === "Produtores" ? "farmer" : it.group ? "layers" : "search"} className="icon-sm" /></span>}
                  <span><b style={{ fontWeight: 500 }}>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const { user, cartCount, logout } = useStore();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [pathname]);

  return (
    <header className="header">
      <div className="container">
        <div className="header-row">
          <button className="menu-btn" aria-label="Menu" aria-expanded={menu} aria-controls="mobile-nav" onClick={() => setMenu((m) => !m)}>
            <Icon name={menu ? "x" : "menu"} />
          </button>
          <Link to="/" className="brand" aria-label="Encantos da Serra, página inicial">
            <span className="brand-mark"><BrandMark /></span>
            <span><span className="brand-name">Encantos</span><span className="brand-sub">da Serra</span></span>
          </Link>
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
          </nav>
          <Search />
          <div className="header-actions">
            {user ? (
              <>
                <Link to="/pedidos" className="header-link" aria-label="Minha conta e pedidos"><Icon name="user" /><span className="label">Minha conta</span></Link>
                <button className="header-link" onClick={() => { logout(); navigate("/"); }} aria-label="Sair"><Icon name="logout" /></button>
              </>
            ) : (
              <Link to="/entrar" className="header-link" aria-label="Entrar"><Icon name="user" /><span className="label">Entrar</span></Link>
            )}
            <Link to="/carrinho" className="header-link" aria-label={cartCount ? `Carrinho, ${cartCount} ${cartCount === 1 ? "item" : "itens"}` : "Carrinho vazio"}>
              <Icon name="cart" /><span className="label">Carrinho</span>
              {cartCount > 0 && <span className="cart-count" aria-hidden="true">{cartCount}</span>}
            </Link>
          </div>
        </div>
        <nav className="mobile-nav" id="mobile-nav" data-open={menu} aria-label="Menu do celular">
          {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
          <Link to="/produtores">Para produtores</Link>
          <Link to="/rastrear">Rastrear pedido</Link>
        </nav>
      </div>
    </header>
  );
}
