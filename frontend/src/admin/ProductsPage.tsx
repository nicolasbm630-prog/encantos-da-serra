import { useMemo, useState } from "react";
import { brl } from "../format";
import { Icon } from "../icons";
import { Link, navigate } from "../router";
import { useApi } from "../store";
import type { AdminProduct } from "./types";

type View = "all" | "active" | "inactive";

// Catálogo do painel: preços de varejo e atacado de cada produto, com atalho para cadastrar e editar.
export function ProductsPage() {
  const { data, loading, reload } = useApi<{ products: AdminProduct[] }>("/admin/products");
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");

  const all = data?.products ?? [];
  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((p) =>
      (view === "all" || (view === "active" ? p.active : !p.active)) &&
      (!term || [p.name, p.sku, p.producer.name, p.category.name].some((t) => t.toLowerCase().includes(term))));
  }, [all, view, q]);
  const inactive = all.filter((p) => !p.active).length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Produtos</h1>
          <p>Cadastre produtos e ajuste o preço de varejo e as faixas do atacado. A quantidade em estoque muda na aba <Link to="/admin/estoque" style={{ textDecoration: "underline" }}>Estoque</Link>.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={reload} disabled={loading}>
            <Icon name={loading ? "loader" : "route"} className={loading ? "icon-sm spin" : "icon-sm"} />Atualizar
          </button>
          <Link to="/admin/produtos/novo" className="btn btn-primary btn-sm"><Icon name="plus" className="icon-sm" />Novo produto</Link>
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="Filtrar produtos">
          <button aria-pressed={view === "all"} onClick={() => setView("all")}>Todos</button>
          <button aria-pressed={view === "active"} onClick={() => setView("active")}>Na loja</button>
          <button aria-pressed={view === "inactive"} onClick={() => setView("inactive")}>Inativos {inactive > 0 && <span className="adm-count adm-count-muted">{inactive}</span>}</button>
        </div>
        <label className="adm-search">
          <Icon name="search" className="icon-sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, SKU, produtor ou categoria" aria-label="Buscar produtos" />
        </label>
      </div>

      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th className="num">Varejo</th>
                <th className="num">Atacado (por un)</th>
                <th className="num">Disponível</th>
                <th>Na loja</th>
                <th className="actions"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={7}><div className="skeleton" style={{ height: 200 }} /></td></tr>}
              {data && products.length === 0 && <tr><td colSpan={7} className="adm-empty">Nenhum produto encontrado.</td></tr>}
              {products.map((p) => {
                const tiers = p.wholesale.tiers;
                const best = tiers.at(-1);
                return (
                  <tr key={p.id} className="adm-row" data-inactive={!p.active} onClick={() => navigate(`/admin/produtos/${p.id}`)}>
                    <td>
                      <span className="adm-prod">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span className="adm-noimg" />}
                        <span>
                          <span className="adm-strong">{p.name}</span>
                          <small className="adm-muted">{p.sku} · {p.producer.name}</small>
                        </span>
                      </span>
                    </td>
                    <td>{p.category.name}</td>
                    <td className="num"><b>{brl(p.retail.priceCents)}</b><small className="adm-muted">por {p.retail.unitLabel}</small></td>
                    <td className="num">
                      {tiers.length ? <>{brl(tiers[0]!.unitPriceCents)}{best && tiers.length > 1 && <> → {brl(best.unitPriceCents)}</>}</> : "—"}
                      <small className="adm-muted">caixa c/ {p.wholesale.boxSize}{p.wholesale.maxDiscountPct > 0 ? ` · até ${p.wholesale.maxDiscountPct}% off` : ""}</small>
                    </td>
                    <td className="num">{(p.availableUnits ?? 0).toLocaleString("pt-BR")} un</td>
                    <td>
                      <span className="adm-stock" data-stock={p.active ? "ok" : "zerado"}>{p.active ? "Ativo" : "Inativo"}</span>
                      {p.featured && <small className="adm-muted">Destaque</small>}
                    </td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/admin/produtos/${p.id}`} className="btn btn-sm btn-outline" aria-label={`Editar ${p.name}`}>Editar</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
