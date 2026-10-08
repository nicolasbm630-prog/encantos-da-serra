import { useEffect, useState } from "react";
import { ApiError, type Product } from "../api";
import { Stepper } from "../components/Chrome";
import { isBusiness, ProductCard } from "../components/ProductCard";
import { brl, grams, longDate } from "../format";
import { Icon } from "../icons";
import { Link, navigate } from "../router";
import { useApi, useStore } from "../store";

type Detail = {
  product: Product;
  currentLot: { code: string; title: string; producedOn: string; cureDays: number | null; notes: string | null } | null;
  related: Product[];
};

const MILK_LABEL: Record<string, string> = { vaca: "Leite de vaca", cabra: "Leite de cabra", bufala: "Leite de búfala", misto: "Leite misto" };

export function ProductPage({ slug }: { slug: string }) {
  const { data, error, loading } = useApi<Detail>(`/products/${slug}`);
  const { addToCart, toast, user, favorites, toggleFavorite } = useStore();
  const [mode, setMode] = useState<"unit" | "box">("unit");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const b2b = isBusiness(user?.role);

  useEffect(() => { setQty(1); setMode("unit"); }, [slug]);
  useEffect(() => { if (data) document.title = `${data.product.name} · Encantos da Serra`; }, [data]);

  if (loading && !data) return <div className="container" style={{ padding: "48px 16px" }}><div className="skeleton" style={{ height: 480 }} /></div>;
  if (error || !data) {
    return (
      <div className="container empty" style={{ padding: "96px 16px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Produto não encontrado</h1>
        <p>Ele pode ter saído do catálogo.</p>
        <Link to="/produtos" className="btn btn-primary">Ver produtos</Link>
      </div>
    );
  }

  const { product: p, currentLot: lot } = data;
  const isFav = favorites.has(p.id);
  const tier = mode === "box" ? [...p.wholesale.tiers].reverse().find((t) => qty >= t.minBoxes) ?? p.wholesale.tiers[0] : undefined;
  const unitPrice = mode === "unit" ? p.retail.priceCents : tier?.unitPriceCents ?? 0;
  const units = mode === "unit" ? qty : qty * p.wholesale.boxSize;
  const max = mode === "unit" ? Math.max(1, p.stock.units) : Math.max(1, p.stock.boxes);

  const add = async () => {
    setBusy(true);
    try {
      await addToCart(p.id, mode, qty);
      toast({ message: `${qty} ${mode === "box" ? (qty > 1 ? "caixas" : "caixa") : p.retail.unitLabel + (qty > 1 ? "s" : "")} de ${p.name} no carrinho.`, href: "/carrinho", hrefLabel: "Ver carrinho" });
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Não foi possível adicionar", kind: "error" });
    } finally { setBusy(false); }
  };

  const fav = async () => {
    if (!user) { navigate(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
    try {
      const on = await toggleFavorite(p.id);
      toast({ message: on ? "Salvo nos favoritos." : "Removido dos favoritos." });
    } catch { toast({ message: "Não foi possível salvar", kind: "error" }); }
  };

  return (
    <>
      <div className="container page-head" style={{ paddingBottom: 20 }}>
        <nav className="breadcrumb" aria-label="Você está em">
          <Link to="/">Início</Link><span aria-hidden="true">/</span>
          <Link to={`/produtos?categoria=${p.category.slug}`}>{p.category.name}</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{p.name}</span>
        </nav>
      </div>
      <div className="container product-page">
        <div className="product-gallery">
          {p.imageUrl && <img src={p.imageUrl} alt={p.name} />}
          {p.awarded && p.badge && <span className="pill"><Icon name="award" />{p.badge}</span>}
        </div>
        <div className="product-info">
          <h1>{p.name}</h1>
          <span className="product-meta">{p.producer.name} · {p.producer.city}, {p.producer.state}</span>

          <div className="buy-box">
            {b2b && (
              <div className="mode-toggle" role="group" aria-label="Como comprar" style={{ justifySelf: "start" }}>
                <button aria-pressed={mode === "unit"} onClick={() => { setMode("unit"); setQty(1); }}>Por {p.retail.unitLabel}</button>
                <button aria-pressed={mode === "box"} onClick={() => { setMode("box"); setQty(1); }}>{p.wholesale.boxLabel}</button>
              </div>
            )}
            <div className="buy-price" aria-live="polite">
              <b>{brl(unitPrice * units)}</b>
              <span>{mode === "unit" ? (qty > 1 ? `${qty} × ${brl(unitPrice)}` : p.retail.priceLabel) : `${units} unidades a ${brl(unitPrice)} cada`}</span>
            </div>
            <div className="buy-row">
              <Stepper value={qty} min={1} max={max} onChange={setQty} label="Quantidade" />
              <button className="btn btn-primary btn-lg" onClick={add} disabled={busy || !p.stock.available}>
                {p.stock.available ? "Adicionar ao carrinho" : "Sem estoque"} <Icon name={busy ? "loader" : "cartPlus"} className={busy ? "icon spin" : "icon"} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="stock-note">{p.stock.available ? "Em estoque" : "Reposição em breve"}</span>
              <button className="fav-link" aria-pressed={isFav} onClick={fav}><Icon name="heart" className="icon-sm" />{isFav ? "Salvo nos favoritos" : "Salvar nos favoritos"}</button>
            </div>
          </div>

          {p.description && <p className="lead">{p.description}</p>}
          <dl className="spec">
            <dt>Leite</dt><dd>{MILK_LABEL[p.milkType] ?? p.milkType}{p.detailTag && p.detailTag !== MILK_LABEL[p.milkType] ? ` · ${p.detailTag}` : ""}</dd>
            <dt>Peso</dt><dd>{grams(p.weightGrams)} por {p.retail.unitLabel}</dd>
            {p.cureDays ? <><dt>Cura</dt><dd>{p.cureDays} dias</dd></> : null}
          </dl>

          <div className="details">
            <details>
              <summary>Entrega refrigerada</summary>
              <div className="content">
                <p>Enviamos em embalagem térmica, entre 2 e 8 °C, da coleta até a sua porta.</p>
                <p>Consulte o frete e o próximo dia de entrega para o seu CEP <Link to="/#entrega" className="link">na página inicial</Link>.</p>
              </div>
            </details>
            {lot && (
              <details>
                <summary>Origem e lote</summary>
                <div className="content">
                  <p>Lote {lot.code}, produzido em {longDate(lot.producedOn)}{lot.cureDays ? `, com ${lot.cureDays} dias de cura` : ""}.</p>
                  <p>Origem e percurso aparecem no acompanhamento do seu pedido.</p>
                </div>
              </details>
            )}
            <details>
              <summary>Comprar por caixa (empresas)</summary>
              <div className="content">
                <table className="tier-table">
                  <caption className="sr-only">Preço por faixa de volume</caption>
                  <thead><tr><th scope="col">Caixas</th><th scope="col">Preço por unidade</th><th scope="col">Caixa com {p.wholesale.boxSize}</th></tr></thead>
                  <tbody>
                    {p.wholesale.tiers.map((t) => (
                      <tr key={t.minBoxes} style={tier?.minBoxes === t.minBoxes ? { background: "var(--green-50)", fontWeight: 600 } : undefined}>
                        <td>{t.maxBoxes ? `${t.minBoxes} a ${t.maxBoxes}` : `${t.minBoxes} ou mais`}</td>
                        <td>{brl(t.unitPriceCents)}</td>
                        <td>{brl(t.unitPriceCents * p.wholesale.boxSize)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!b2b && <p>Compra por caixa é para contas de empresa. <Link to="/entrar?tipo=empresa" className="link">Criar conta de empresa</Link></p>}
              </div>
            </details>
          </div>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="section section-alt" aria-labelledby="relacionados">
          <div className="container">
            <div className="section-head"><h2 id="relacionados">Você também pode gostar</h2></div>
            <div className="product-grid">{data.related.map((r) => <ProductCard key={r.id} product={r} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
