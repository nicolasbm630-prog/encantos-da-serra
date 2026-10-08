import { useEffect, useState } from "react";
import { qs, type ProductList } from "../api";
import { ProductCard, ProductSkeletons } from "../components/ProductCard";
import { Icon } from "../icons";
import { Link, navigate, useLocation } from "../router";
import { useApi } from "../store";

type Category = { slug: string; name: string; productCount: number };

const MILK = [
  { value: "", label: "Todos" },
  { value: "vaca", label: "Leite de vaca" },
  { value: "cabra", label: "Leite de cabra" },
];
const CURE = [
  { value: "", label: "Qualquer cura" },
  { value: "0-14", label: "Até 14 dias" },
  { value: "15-30", label: "15 a 30 dias" },
  { value: "31-59", label: "31 a 59 dias" },
  { value: "60-", label: "60 dias ou mais" },
];
const SORTS = [
  { value: "featured", label: "Destaques" },
  { value: "best_sellers", label: "Mais pedidos" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "name", label: "Nome (A–Z)" },
];

const range = (v: string | null) => {
  if (!v) return [undefined, undefined] as const;
  const [a, b] = v.split("-");
  return [a ? Number(a) : undefined, b ? Number(b) : undefined] as const;
};

export function CatalogPage() {
  const { search } = useLocation();
  const [open, setOpen] = useState(false);
  const categories = useApi<{ categories: Category[] }>("/categories");

  // Aceita os nomes da API e apelidos em português (?categoria=, ?produtor=, ?premiados=)
  const category = search.get("categoria") ?? search.get("category") ?? "";
  const producer = search.get("produtor") ?? search.get("producer") ?? "";
  const q = search.get("q") ?? "";
  const milk = search.get("milk") ?? "";
  const awarded = search.has("premiados") || search.get("awarded") === "true";
  const cure = search.get("cura") ?? (search.has("cureMin") || search.has("cureMax") ? `${search.get("cureMin") ?? ""}-${search.get("cureMax") ?? ""}` : "");
  const sort = search.get("ordem") ?? "featured";
  const page = Number(search.get("pagina") ?? 1);

  const [cureMin, cureMax] = range(cure);
  const apiPath = `/products${qs({ category, producer, q, milk, awarded: awarded || undefined, cureMin, cureMax, sort, page, pageSize: 12 })}`;
  const { data, loading } = useApi<ProductList>(apiPath);

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const k of ["category", "producer", "awarded", "cureMin", "cureMax", "minWeight", "maxWeight"]) next.delete(k);
    if (category && !("categoria" in changes)) next.set("categoria", category);
    if (cure && !("cura" in changes)) next.set("cura", cure);
    if (awarded && !("premiados" in changes)) next.set("premiados", "1");
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    if (!("pagina" in changes)) next.delete("pagina");
    const s = next.toString();
    navigate(`/produtos${s ? `?${s}` : ""}`, { scroll: "pagina" in changes });
  };

  const currentCategory = categories.data?.categories.find((c) => c.slug === category);
  useEffect(() => { document.title = `${currentCategory?.name ?? "Produtos"} · Encantos da Serra`; }, [currentCategory]);
  const hasFilters = !!(category || producer || q || milk || awarded || cure);

  return (
    <>
      <div className="container page-head">
        <nav className="breadcrumb" aria-label="Você está em"><Link to="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Produtos</span></nav>
        <h1>{q ? `Resultados para “${q}”` : currentCategory?.name ?? "Todos os produtos"}</h1>
        {producer && <p>Produtos deste produtor.</p>}
      </div>
      <div className="container catalog">
        <aside className="filters" id="filtros" data-open={open} aria-label="Filtros">
          <div>
            <h2>Categoria</h2>
            <div className="filter-list">
              <button className="filter-opt" aria-pressed={!category} onClick={() => set({ categoria: null })}>Todas</button>
              {categories.data?.categories.map((c) => (
                <button key={c.slug} className="filter-opt" aria-pressed={category === c.slug} onClick={() => set({ categoria: c.slug })}>
                  {c.name}<small>{c.productCount}</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2>Leite</h2>
            <div className="filter-list">{MILK.map((m) => <button key={m.value} className="filter-opt" aria-pressed={milk === m.value} onClick={() => set({ milk: m.value || null })}>{m.label}</button>)}</div>
          </div>
          <div>
            <h2>Cura</h2>
            <div className="filter-list">{CURE.map((m) => <button key={m.value} className="filter-opt" aria-pressed={cure === m.value} onClick={() => set({ cura: m.value || null })}>{m.label}</button>)}</div>
          </div>
          <div>
            <h2>Prêmios</h2>
            <div className="filter-list"><button className="filter-opt" aria-pressed={awarded} onClick={() => set({ premiados: awarded ? null : "1" })}>Só premiados</button></div>
          </div>
          {hasFilters && <button className="btn btn-outline btn-sm" onClick={() => navigate("/produtos")}>Limpar filtros</button>}
        </aside>

        <div>
          <div className="catalog-bar">
            <span className="muted" role="status">{loading ? "Buscando…" : `${data?.total ?? 0} produto${data?.total === 1 ? "" : "s"}`}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm filters-toggle" aria-expanded={open} aria-controls="filtros" onClick={() => setOpen((o) => !o)}><Icon name="sliders" className="icon-sm" />{open ? "Fechar filtros" : "Filtros"}</button>
              <select className="select" value={sort} onChange={(e) => set({ ordem: e.target.value === "featured" ? null : e.target.value })} aria-label="Ordenar">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="product-grid cols-3">
            {loading && !data ? <ProductSkeletons count={6} /> : data?.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {!loading && data?.items.length === 0 && (
            <div className="empty card">
              <h3>Nenhum produto com esses filtros</h3>
              <p>Tente remover algum filtro ou buscar por outro termo.</p>
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/produtos")}>Ver tudo</button>
            </div>
          )}
          {data && data.totalPages > 1 && (
            <nav className="pagination" aria-label="Páginas">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} aria-label={`Página ${n}`} aria-current={n === page ? "page" : undefined} onClick={() => set({ pagina: n === 1 ? null : String(n) })}>{n}</button>
              ))}
            </nav>
          )}
        </div>
      </div>
    </>
  );
}
