import { useEffect, useState } from "react";
import { api, ApiError, type DeliveryInfo, type Order } from "../api";
import { Stepper } from "../components/Chrome";
import { brl, cepMask, shortDate } from "../format";
import { Icon } from "../icons";
import { Link, navigate } from "../router";
import { useStore } from "../store";

const EMPTY_ADDRESS = { recipient: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

export function CartPage() {
  const { cart, setCartQty, refreshCart, user, toast } = useStore();
  const [cep, setCep] = useState("");
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [cepError, setCepError] = useState<string | null>(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

  useEffect(() => { document.title = "Carrinho · Encantos da Serra"; refreshCart(); }, [refreshCart]);
  useEffect(() => { if (user && !address.recipient) setAddress((a) => ({ ...a, recipient: user.name })); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) { setDelivery(null); setCepError(null); return; }
    let alive = true;
    api<DeliveryInfo>(`/delivery/cep/${digits}`)
      .then((d) => { if (alive) { setDelivery(d); setCepError(null); } })
      .catch((e) => { if (alive) { setDelivery(null); setCepError(e instanceof ApiError ? e.message : "Falha ao consultar CEP"); } });
    return () => { alive = false; };
  }, [cep]);

  if (placed) {
    return (
      <div className="container" style={{ padding: "64px 16px 96px", maxWidth: 720 }}>
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <span className="icon-circle" style={{ margin: "0 auto 16px", width: 56, height: 56 }}><Icon name="checkCircle" /></span>
          <h1 style={{ fontSize: 32 }}>Pedido {placed.code} recebido!</h1>
          <p className="muted" style={{ margin: "12px auto 24px", maxWidth: 480 }}>
            Total de <b>{brl(placed.totalCents)}</b>. {placed.scheduledDelivery ? <>Entrega prevista na rota de <b>{shortDate(placed.scheduledDelivery)}</b> ({placed.deliveryRegion}).</> : null} Você acompanha cada etapa, com a temperatura da viagem, pelo rastreio.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to={`/pedidos/${placed.code}`} className="btn btn-primary">Acompanhar pedido <Icon name="arrowRight" className="icon-sm" /></Link>
            <Link to="/produtos" className="btn btn-outline">Continuar comprando</Link>
          </div>
        </div>
      </div>
    );
  }

  const lines = cart?.lines ?? [];
  const subtotal = cart?.totals.subtotalCents ?? 0;
  const shipping = delivery ? (delivery.freeShippingOverCents !== null && subtotal >= delivery.freeShippingOverCents ? 0 : delivery.feeCents) : null;
  const hasBox = lines.some((l) => l.mode === "box");
  const isB2B = user?.role === "business" || user?.role === "admin";

  const checkout = async () => {
    if (!user) { navigate("/entrar?next=/carrinho"); return; }
    const errs: Record<string, string> = {};
    if (cep.replace(/\D/g, "").length !== 8 || !delivery) errs.cep = "Informe um CEP atendido";
    for (const [k, label] of [["recipient", "Destinatário"], ["street", "Rua"], ["number", "Número"], ["district", "Bairro"], ["city", "Cidade"]] as const) {
      if (!address[k].trim()) errs[k] = `${label} obrigatório`;
    }
    if (address.state.trim().length !== 2) errs.state = "UF com 2 letras";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setPlacing(true);
    try {
      const { complement, ...rest } = address;
      const { order } = await api<{ order: Order }>("/orders", {
        body: { cartToken: cart!.token, cep, address: complement.trim() ? address : rest },
      });
      setPlaced(order);
      window.scrollTo({ top: 0 });
      refreshCart();
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Não foi possível fechar o pedido", kind: "error" });
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(e.details.map((d) => [d.field.replace("address.", ""), d.message])));
    } finally { setPlacing(false); }
  };

  const input = (key: keyof typeof EMPTY_ADDRESS, label: string, cls = "", placeholder = "") => (
    <label className={`field ${cls}`} data-error={!!errors[key]}>
      <span>{label}</span>
      <input className="input" value={address[key]} placeholder={placeholder} onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))} />
      {errors[key] && <small className="error">{errors[key]}</small>}
    </label>
  );

  return (
    <>
      <div className="container page-head">
        <nav className="breadcrumb"><Link to="/">Início</Link><span>/</span><span>Carrinho</span></nav>
        <h1>Seu carrinho</h1>
        {user && <p><Link to="/pedidos" style={{ textDecoration: "underline" }}>Ver meus pedidos anteriores</Link></p>}
      </div>
      {lines.length === 0 ? (
        <div className="container" style={{ paddingBottom: 96 }}>
          <div className="card empty">
            <h3>Seu carrinho está vazio</h3>
            <p>Que tal começar pelos destaques da estação?</p>
            <Link to="/produtos" className="btn btn-primary">Explorar catálogo <Icon name="arrowRight" className="icon-sm" /></Link>
          </div>
        </div>
      ) : (
        <div className="container cart-layout">
          <div>
            <div className="card" style={{ padding: "4px 20px" }}>
              {lines.map((l) => (
                <div key={l.itemId} className="cart-line">
                  {l.product.imageUrl ? <img src={l.product.imageUrl} alt="" /> : <span />}
                  <div>
                    <small>{l.product.producerName}</small>
                    <h3><Link to={`/produtos/${l.product.slug}`}>{l.product.name}</Link></h3>
                    <small>{l.mode === "box" ? `${l.product.boxLabel} • ${l.units} un a ${brl(l.unitPriceCents)}` : `${brl(l.unitPriceCents)} por ${l.product.unitLabel}`}</small>
                    {l.savingsCents > 0 && <small style={{ color: "var(--green-700)" }}>Economia de {brl(l.savingsCents)} na faixa</small>}
                    {l.issue && <span className="issue">Estoque insuficiente — disponível: {l.availableUnits} un</span>}
                  </div>
                  <div className="right">
                    <b style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 500 }}>{brl(l.totalCents)}</b>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <Stepper value={l.quantity} min={1} onChange={(v) => setCartQty(l.product.id, l.mode, v)} label={`Quantidade de ${l.product.name}`} />
                      <button className="remove-btn" aria-label={`Remover ${l.product.name}`} onClick={() => setCartQty(l.product.id, l.mode, 0)}><Icon name="trash" className="icon-sm" /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 24, marginTop: 20 }}>
              <h3 style={{ fontSize: 22, marginBottom: 16 }}>Entrega refrigerada</h3>
              <div className="form-grid">
                <label className="field" data-error={!!(errors.cep || cepError)}>
                  <span>CEP</span>
                  <input className="input" value={cep} inputMode="numeric" placeholder="00000-000" onChange={(e) => setCep(cepMask(e.target.value))} />
                  {(errors.cep || cepError) && <small className="error">{cepError ?? errors.cep}</small>}
                </label>
                <div className="span-2" style={{ alignSelf: "end" }}>
                  {delivery && (
                    <div className="notice ok">
                      <b>{delivery.region}</b> — rota de {delivery.nextDelivery?.weekday}, {delivery.nextDelivery ? shortDate(delivery.nextDelivery.date) : "a confirmar"} • frete {shipping === 0 ? "grátis" : brl(delivery.feeCents)}
                    </div>
                  )}
                </div>
                {input("recipient", "Destinatário", "span-all")}
                {input("street", "Rua", "span-2")}
                {input("number", "Número")}
                {input("complement", "Complemento", "", "Opcional")}
                {input("district", "Bairro", "span-2")}
                {input("city", "Cidade", "span-2")}
                {input("state", "UF", "", "MG")}
              </div>
            </div>
          </div>

          <aside className="card summary">
            <h3 style={{ fontSize: 22 }}>Resumo</h3>
            <div className="summary-row"><span>Subtotal ({cart?.totals.units} un)</span><span>{brl(subtotal)}</span></div>
            {(cart?.totals.savingsCents ?? 0) > 0 && <div className="summary-row" style={{ color: "var(--green-700)" }}><span>Economia no atacado</span><span>−{brl(cart!.totals.savingsCents)}</span></div>}
            <div className="summary-row"><span>Frete refrigerado</span><span>{shipping === null ? "informe o CEP" : shipping === 0 ? "Grátis" : brl(shipping)}</span></div>
            {delivery?.freeShippingOverCents && shipping !== 0 && <small className="muted">Frete grátis acima de {brl(delivery.freeShippingOverCents)} para {delivery.region}.</small>}
            <div className="summary-row total"><span>Total</span><b>{brl(subtotal + (shipping ?? 0))}</b></div>
            {hasBox && !isB2B && <div className="notice error">Há caixas no carrinho: compras por caixa exigem conta B2B.</div>}
            {cart?.hasIssues && <div className="notice error">Ajuste as quantidades sem estoque para continuar.</div>}
            <button className="btn btn-primary btn-lg btn-block" onClick={checkout} disabled={placing || cart?.hasIssues || (hasBox && !!user && !isB2B)}>
              {user ? "Finalizar pedido" : "Entrar para finalizar"} <Icon name={placing ? "loader" : "arrowRight"} className={placing ? "icon spin" : "icon"} />
            </button>
            <small className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="shield" className="icon-sm" />Pagamento combinado na confirmação (projeto de estudos).</small>
          </aside>
        </div>
      )}
    </>
  );
}
