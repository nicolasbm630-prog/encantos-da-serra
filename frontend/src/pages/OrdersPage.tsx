import { useEffect, useState } from "react";
import { api, ApiError, type Order } from "../api";
import { brl, dateTime, longDate, shortDate, STATUS_LABEL } from "../format";
import { Icon } from "../icons";
import { Link, navigate, useLocation } from "../router";
import { useApi, useStore } from "../store";

export function OrderView({ order }: { order: Order }) {
  return (
    <div className="two-col">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 22 }}>Pedido {order.code}</h3>
          <span className="status" data-status={order.status}>{STATUS_LABEL[order.status] ?? order.status}</span>
        </div>
        <ol className="timeline">
          {order.timeline.map((e, i) => (
            <li key={i}>
              <strong>{STATUS_LABEL[e.status] ?? e.status}</strong>
              <small>{e.message}{e.temperatureC !== null ? ` • ${Number(e.temperatureC).toLocaleString("pt-BR")} ºC` : ""} • {dateTime(e.at)}</small>
            </li>
          ))}
        </ol>
        {order.scheduledDelivery && <div className="notice ok" style={{ marginTop: 8 }}><Icon name="truck" className="icon-sm" style={{ verticalAlign: "-3px" }} /> Rota prevista: {shortDate(order.scheduledDelivery)} — {order.deliveryRegion}</div>}
      </div>
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 20, marginBottom: 12 }}>Itens e lotes</h3>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {order.items.map((i, idx) => (
                <tr key={idx}>
                  <td>
                    <b style={{ fontWeight: 600 }}>{i.productName}</b>
                    <small className="muted" style={{ display: "block" }}>{i.mode === "box" ? `${i.quantity} cx • ${i.units} un` : `${i.quantity} un`} a {brl(i.unitPriceCents)}</small>
                    {i.lot && <small className="muted" style={{ display: "block" }}>Lote {i.lot.code} • produzido em {longDate(i.lot.producedOn)}</small>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{brl(i.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="summary-row" style={{ marginTop: 14 }}><span>Subtotal</span><span>{brl(order.subtotalCents)}</span></div>
        <div className="summary-row" style={{ marginTop: 6 }}><span>Frete</span><span>{order.shippingCents ? brl(order.shippingCents) : "Grátis"}</span></div>
        <div className="summary-row total" style={{ marginTop: 10 }}><span>Total</span><b>{brl(order.totalCents)}</b></div>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const { user, ready } = useStore();
  const { data, loading } = useApi<{ orders: { code: string; channel: string; status: string; totalCents: number; scheduledDelivery: string | null; createdAt: string; itemCount: number }[] }>(user ? "/orders" : null, [user?.id]);
  useEffect(() => { document.title = "Meus pedidos · Encantos da Serra"; }, []);
  useEffect(() => { if (ready && !user) navigate("/entrar?next=/pedidos", { replace: true }); }, [ready, user]);

  return (
    <div className="container" style={{ paddingBottom: 96 }}>
      <div className="page-head"><span className="eyebrow">Minha conta</span><h1>Meus pedidos</h1></div>
      <div className="card" style={{ padding: "8px 20px" }}>
        {loading ? <div className="skeleton" style={{ height: 120, margin: 12 }} /> : data?.orders.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Status</th><th>Entrega</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.code} data-link onClick={() => navigate(`/pedidos/${o.code}`)}>
                    <td><Link to={`/pedidos/${o.code}`}><b style={{ fontWeight: 600 }}>{o.code}</b></Link><small className="muted" style={{ display: "block" }}>{o.itemCount} itens</small></td>
                    <td>{dateTime(o.createdAt)}</td>
                    <td>{o.channel === "wholesale" ? "Atacado" : "Varejo"}</td>
                    <td><span className="status" data-status={o.status}>{STATUS_LABEL[o.status]}</span></td>
                    <td>{o.scheduledDelivery ? shortDate(o.scheduledDelivery) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{brl(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><h3>Nenhum pedido ainda</h3><p>Seus pedidos aparecem aqui com o rastreio da entrega.</p><Link to="/produtos" className="btn btn-primary">Explorar catálogo</Link></div>
        )}
      </div>
    </div>
  );
}

export function OrderDetailPage({ code }: { code: string }) {
  const { user, ready } = useStore();
  const { data, error, loading } = useApi<{ order: Order }>(user ? `/orders/${code}` : null, [user?.id]);
  useEffect(() => { if (ready && !user) navigate(`/entrar?next=/pedidos/${code}`, { replace: true }); }, [ready, user, code]);
  return (
    <div className="container" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <nav className="breadcrumb"><Link to="/pedidos">Meus pedidos</Link><span>/</span><span>{code}</span></nav>
      </div>
      {loading || !ready ? <div className="skeleton" style={{ height: 320 }} /> : error ? <div className="card empty"><h3>Pedido não encontrado</h3></div> : data && <OrderView order={data.order} />}
    </div>
  );
}

export function TrackPage() {
  const { search } = useLocation();
  const [code, setCode] = useState(search.get("codigo") ?? "");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "Rastrear pedido · Encantos da Serra"; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { order } = await api<{ order: Order }>(`/orders/track?code=${encodeURIComponent(code.trim())}&email=${encodeURIComponent(email.trim())}`);
      setOrder(order);
    } catch (err) {
      setOrder(null);
      setError(err instanceof ApiError && err.status === 404 ? "Não encontramos um pedido com esse código e e-mail." : err instanceof ApiError ? err.message : "Falha de conexão");
    } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <span className="eyebrow">Rastreabilidade</span>
        <h1>Rastrear pedido</h1>
        <p>Veja cada etapa da entrega, a temperatura registrada na rota e a origem de cada lote.</p>
      </div>
      <form className="card" onSubmit={submit} style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, alignItems: "end", marginBottom: 24 }}>
        <label className="field"><span>Código do pedido</span><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PED-2026-000001" required /></label>
        <label className="field"><span>E-mail da compra</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy}>Rastrear <Icon name={busy ? "loader" : "search"} className={busy ? "icon-sm spin" : "icon-sm"} /></button>
      </form>
      {error && <div className="notice error" role="alert">{error}</div>}
      {order && <OrderView order={order} />}
    </div>
  );
}
