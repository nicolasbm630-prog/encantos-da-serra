import { useState } from "react";
import { ApiError, type Product } from "../api";
import { brl } from "../format";
import { Icon } from "../icons";
import { Link } from "../router";
import { useStore } from "../store";

export const isBusiness = (role?: string) => role === "business" || role === "admin";

// Card enxuto: foto, nome, origem, preço e um botão. Conta B2B vê o preço por caixa direto.
export function ProductCard({ product: p }: { product: Product }) {
  const { addToCart, toast, user } = useStore();
  const [busy, setBusy] = useState(false);
  const b2b = isBusiness(user?.role);
  const firstTier = p.wholesale.tiers[0];

  const add = async () => {
    setBusy(true);
    try {
      await addToCart(p.id, b2b ? "box" : "unit");
      toast({ message: `${p.name}${b2b ? ` (${p.wholesale.boxLabel.toLowerCase()})` : ""} no carrinho.`, href: "/carrinho", hrefLabel: "Ver carrinho" });
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Não foi possível adicionar", kind: "error" });
    } finally { setBusy(false); }
  };

  return (
    <article className="card product-card">
      <Link to={`/produtos/${p.slug}`} className="product-media" tabIndex={-1} aria-hidden="true">
        {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
        {p.awarded && p.badge && <span className="pill"><Icon name="award" />{p.badge}</span>}
      </Link>
      <div className="product-body">
        <h3 className="product-name"><Link to={`/produtos/${p.slug}`}>{p.name}</Link></h3>
        <span className="product-meta">{p.producer.name} · {p.producer.city}, {p.producer.state}</span>
        <div className="product-price">
          {b2b
            ? <><b>{brl((firstTier?.unitPriceCents ?? 0) * p.wholesale.boxSize)}</b><small>{p.wholesale.boxLabel.toLowerCase()}</small></>
            : <><b>{brl(p.retail.priceCents)}</b><small>{p.retail.priceLabel}</small></>}
        </div>
        <button className="btn btn-primary btn-block" onClick={add} disabled={busy || !p.stock.available} aria-label={p.stock.available ? `Adicionar ${p.name} ao carrinho` : `${p.name} sem estoque`}>
          {!p.stock.available ? "Sem estoque" : "Adicionar"}
          <Icon name={busy ? "loader" : "cartPlus"} className={busy ? "icon-sm spin" : "icon-sm"} />
        </button>
      </div>
    </article>
  );
}

export function ProductSkeletons({ count = 4 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: ".75" }} />)}</>;
}
