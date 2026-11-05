import { useEffect, useRef, useState } from "react";
import { brl, STATUS_LABEL } from "../format";
import { Icon, type IconName } from "../icons";
import { Link } from "../router";
import { useApi } from "../store";

type Totals = { revenueCents: number; orders: number; customers: number; units: number; avgTicketCents: number };
type Analytics = {
  days: number;
  current: Totals;
  previous: Totals | null;
  daily: { date: string; revenueCents: number; orders: number }[];
  channels: { channel: "retail" | "wholesale"; revenueCents: number; orders: number }[];
  products: { id: number; name: string; revenueCents: number; units: number }[];
  categories: { name: string; revenueCents: number; units: number }[];
  regions: { name: string; revenueCents: number; orders: number }[];
  statuses: { status: string; orders: number; revenueCents: number }[];
  stock: { valueCents: number; expiredValueCents: number; onHandUnits: number; expiredUnits: number; expiringProducts: number; belowMinimum: number; withShortage: number };
  pending: { openQuotes: number; proposalsToReview: number; unreadMessages: number };
};

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "12 meses" },
  { days: 0, label: "Tudo" },
];

const compactBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const brlCompact = (cents: number) => compactBrl.format(cents / 100);
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", opts).replace(".", "");
const PIPELINE = ["pending", "confirmed", "preparing", "in_transit", "delivered", "cancelled"];

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data, loading } = useApi<Analytics>(`/admin/analytics?days=${days}`);
  const period = PERIODS.find((p) => p.days === days)!;
  const compareLabel = days ? `vs ${period.label} anteriores` : "";

  return (
    <div className="dash">
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p>Vendas consideram todos os pedidos não cancelados. Estoque e pendências mostram a situação de agora.</p>
        </div>
      </div>

      {/* Filtro único, acima de tudo o que ele afeta */}
      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="Período">
          {PERIODS.map((p) => <button key={p.days} aria-pressed={days === p.days} onClick={() => setDays(p.days)}>{p.label}</button>)}
        </div>
      </div>

      {!data ? <div className="skeleton" style={{ height: 420 }} /> : (
        <div className="dash-body" data-loading={loading}>
          <div className="dash-kpis">
            <StatTile label="Faturamento" value={brl(data.current.revenueCents)} now={data.current.revenueCents} before={data.previous?.revenueCents} compare={compareLabel} hero />
            <StatTile label="Pedidos" value={String(data.current.orders)} now={data.current.orders} before={data.previous?.orders} compare={compareLabel} />
            <StatTile label="Ticket médio" value={data.current.orders ? brl(data.current.avgTicketCents) : "—"} now={data.current.avgTicketCents} before={data.previous?.avgTicketCents} compare={compareLabel} />
            <StatTile label="Unidades vendidas" value={data.current.units.toLocaleString("pt-BR")} now={data.current.units} before={data.previous?.units} compare={compareLabel} />
            <StatTile label="Clientes que compraram" value={String(data.current.customers)} now={data.current.customers} before={data.previous?.customers} compare={compareLabel} />
          </div>

          <section className="adm-card dash-card dash-wide" aria-labelledby="dash-daily">
            <header><h2 id="dash-daily">Faturamento por dia</h2><span className="adm-muted">{period.label === "Tudo" ? "todo o histórico" : `últimos ${period.label}`}</span></header>
            {data.current.orders === 0
              ? <p className="dash-empty">Nenhuma venda neste período.</p>
              : <RevenueChart points={data.daily} />}
            <DataTable caption="Faturamento por dia" head={["Dia", "Pedidos", "Faturamento"]}
              rows={data.daily.filter((d) => d.orders).map((d) => [dayLabel(d.date, { day: "2-digit", month: "2-digit", year: "numeric" }), String(d.orders), brl(d.revenueCents)])} />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-channel">
            <header><h2 id="dash-channel">Varejo × atacado</h2><span className="adm-muted">participação no faturamento</span></header>
            <ChannelSplit channels={data.channels} />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-status">
            <header><h2 id="dash-status">Pedidos por situação</h2><span className="adm-muted">pedidos feitos no período</span></header>
            <RankedBars ordered items={PIPELINE.map((s) => {
              const row = data.statuses.find((x) => x.status === s);
              return { name: STATUS_LABEL[s] ?? s, value: row?.orders ?? 0, label: String(row?.orders ?? 0), sub: row ? brl(row.revenueCents) : undefined };
            })} empty="Nenhum pedido no período." />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-products">
            <header><h2 id="dash-products">Produtos que mais faturaram</h2><span className="adm-muted">sem frete</span></header>
            <RankedBars items={data.products.map((p) => ({ name: p.name, value: p.revenueCents, label: brl(p.revenueCents), sub: `${p.units.toLocaleString("pt-BR")} un` }))} empty="Nenhuma venda no período." />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-categories">
            <header><h2 id="dash-categories">Faturamento por categoria</h2><span className="adm-muted">sem frete</span></header>
            <RankedBars items={data.categories.map((c) => ({ name: c.name, value: c.revenueCents, label: brl(c.revenueCents), sub: `${c.units.toLocaleString("pt-BR")} un` }))} empty="Nenhuma venda no período." />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-regions">
            <header><h2 id="dash-regions">Vendas por região</h2><Link to="/admin/rotas" className="adm-muted" style={{ textDecoration: "underline" }}>Rotas</Link></header>
            <RankedBars items={data.regions.map((r) => ({ name: r.name, value: r.revenueCents, label: brl(r.revenueCents), sub: `${r.orders} ${r.orders === 1 ? "pedido" : "pedidos"}` }))} empty="Nenhuma venda no período." />
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-stock">
            <header><h2 id="dash-stock">Estoque agora</h2><Link to="/admin/estoque" className="adm-muted" style={{ textDecoration: "underline" }}>Abrir estoque</Link></header>
            <div className="dash-mini">
              <Mini icon="snowflake" label="Valor em estoque" value={brl(data.stock.valueCents)} hint={`${data.stock.onHandUnits.toLocaleString("pt-BR")} un a preço de varejo`} />
              <Mini icon="calendar" label="Vencidas" value={`${data.stock.expiredUnits.toLocaleString("pt-BR")} un`} hint={data.stock.expiredUnits ? `${brl(data.stock.expiredValueCents)} parados` : "nenhuma"} status={data.stock.expiredUnits ? "critical" : undefined} />
              <Mini icon="box" label="Falta para pedidos" value={String(data.stock.withShortage)} hint="produtos" status={data.stock.withShortage ? "critical" : undefined} />
              <Mini icon="trending" label="Abaixo do mínimo" value={String(data.stock.belowMinimum)} hint="produtos" status={data.stock.belowMinimum ? "warning" : undefined} />
            </div>
          </section>

          <section className="adm-card dash-card" aria-labelledby="dash-pending">
            <header><h2 id="dash-pending">Pendências</h2></header>
            <div className="dash-mini">
              <Mini icon="receipt" label="Cotações B2B abertas" value={String(data.pending.openQuotes)} status={data.pending.openQuotes ? "warning" : undefined} />
              <Mini icon="farmer" label="Propostas de produtores" value={String(data.pending.proposalsToReview)} hint="para analisar" status={data.pending.proposalsToReview ? "warning" : undefined} />
              <Mini icon="mail" label="Mensagens" value={String(data.pending.unreadMessages)} hint="não respondidas" status={data.pending.unreadMessages ? "warning" : undefined} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Valor + variação contra o período anterior (sinal, seta e texto: nunca só a cor).
function StatTile({ label, value, now, before, compare, hero }: { label: string; value: string; now: number; before?: number; compare: string; hero?: boolean }) {
  let delta: { text: string; dir: "up" | "down" | "flat" } | null = null;
  if (before !== undefined && compare) {
    if (before === 0) delta = now > 0 ? { text: `novo ${compare}`, dir: "up" } : null;
    else {
      const pct = Math.round(((now - before) / before) * 100);
      delta = { text: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}% ${compare}`, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
    }
  }
  return (
    <div className={`dash-tile ${hero ? "hero" : ""}`}>
      <span className="dash-tile-label">{label}</span>
      <b>{value}</b>
      {delta && (
        <small className="dash-delta" data-dir={delta.dir}>
          {delta.dir !== "flat" && <span aria-hidden="true">{delta.dir === "up" ? "▲" : "▼"} </span>}{delta.text}
        </small>
      )}
    </div>
  );
}

function Mini({ icon, label, value, hint, status }: { icon: IconName; label: string; value: string; hint?: string; status?: "critical" | "warning" }) {
  return (
    <div className="dash-mini-item" data-status={status}>
      <span className="adm-kpi-icon" style={{ position: "static" }}><Icon name={status === "critical" ? "x" : icon} className="icon-sm" /></span>
      <div>
        <span className="dash-tile-label">{label}{status && <span className="sr-only">{status === "critical" ? " (crítico)" : " (atenção)"}</span>}</span>
        <b>{value}</b>
        {hint && <small className="adm-muted">{hint}</small>}
      </div>
    </div>
  );
}

// Barras horizontais de um tom só, maior primeiro (ou na ordem dada), valor na ponta.
function RankedBars({ items, empty, ordered }: { items: { name: string; value: number; label: string; sub?: string }[]; empty: string; ordered?: boolean }) {
  const rows = ordered ? items : [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!max) return <p className="dash-empty">{empty}</p>;
  return (
    <ul className="dash-bars">
      {rows.map((r) => (
        <li key={r.name} tabIndex={0} aria-label={`${r.name}: ${r.label}${r.sub ? `, ${r.sub}` : ""}`}>
          <span className="dash-bar-name">{r.name}</span>
          <span className="dash-bar-track">
            <span className="dash-bar" style={{ "--w": r.value / max } as React.CSSProperties} data-zero={r.value === 0} />
            <span className="dash-bar-value">{r.label}{r.sub && <small> · {r.sub}</small>}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Uma barra alta dividida em duas partes, com a fatia impressa dentro quando cabe.
function ChannelSplit({ channels }: { channels: Analytics["channels"] }) {
  const parts = (["retail", "wholesale"] as const).map((c) => {
    const row = channels.find((x) => x.channel === c);
    return { id: c, name: c === "retail" ? "Varejo" : "Atacado", revenue: row?.revenueCents ?? 0, orders: row?.orders ?? 0 };
  });
  const total = parts.reduce((a, p) => a + p.revenue, 0);
  if (!total) return <p className="dash-empty">Nenhuma venda no período.</p>;
  return (
    <>
      <div className="dash-split" role="img" aria-label={parts.map((p) => `${p.name}: ${Math.round((p.revenue / total) * 100)}%, ${brl(p.revenue)}`).join("; ")}>
        {parts.filter((p) => p.revenue > 0).map((p) => {
          const share = p.revenue / total;
          return (
            <span key={p.id} className="dash-split-part" data-part={p.id} style={{ flexGrow: share }} title={`${p.name}: ${brl(p.revenue)} em ${p.orders} pedidos`}>
              {share >= 0.12 && `${Math.round(share * 100)}%`}
            </span>
          );
        })}
      </div>
      <ul className="dash-legend">
        {parts.map((p) => (
          <li key={p.id}><i data-part={p.id} />{p.name}<b>{brl(p.revenue)}</b><small className="adm-muted">{p.orders} {p.orders === 1 ? "pedido" : "pedidos"} · {Math.round((p.revenue / total) * 100)}%</small></li>
        ))}
      </ul>
    </>
  );
}

// Linha com área, eixo Y em valores redondos, crosshair + tooltip no mouse e setas no teclado.
function RevenueChart({ points }: { points: Analytics["daily"] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220, M = { top: 12, right: 12, bottom: 28, left: 64 };
  const w = width - M.left - M.right, h = H - M.top - M.bottom;
  const maxRaw = Math.max(...points.map((p) => p.revenueCents), 1);
  const step = niceStep(maxRaw / 4);
  const yMax = Math.ceil(maxRaw / step) * step;
  const x = (i: number) => M.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => M.top + h - (v / yMax) * h;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.revenueCents).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${M.top + h}L${x(0).toFixed(1)},${M.top + h}Z`;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const xEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 90))));
  const best = points.reduce((b, p, i) => (p.revenueCents > points[b]!.revenueCents ? i : b), 0);

  const pick = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const rel = clientX - rect.left - M.left;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round((rel / w) * (points.length - 1)))));
  };
  const a = active !== null ? points[active] : null;

  return (
    <div className="dash-chart" ref={wrap}>
      <svg width={width} height={H} role="img" tabIndex={0}
        aria-label={`Faturamento por dia. Maior dia: ${dayLabel(points[best]!.date)}, ${brl(points[best]!.revenueCents)}. Use as setas para percorrer os dias.`}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((v) => v ?? best)} onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); setActive((v) => Math.min(points.length - 1, (v ?? -1) + 1)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); setActive((v) => Math.max(0, (v ?? points.length) - 1)); }
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + w} y1={y(t)} y2={y(t)} className={t === 0 ? "dash-axis" : "dash-grid"} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="dash-tick">{brlCompact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % xEvery === 0 || i === points.length - 1) && (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="dash-tick">{dayLabel(p.date)}</text>
        ))}
        <path d={area} className="dash-area" />
        <path d={line} className="dash-line" />
        {/* Rótulo só no maior dia; o resto fica no tooltip e na tabela */}
        <circle cx={x(best)} cy={y(points[best]!.revenueCents)} r={4.5} className="dash-dot" />
        {a && (
          <>
            <line x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + h} className="dash-crosshair" />
            <circle cx={x(active!)} cy={y(a.revenueCents)} r={4.5} className="dash-dot" />
          </>
        )}
      </svg>
      {a && (
        <div className="dash-tooltip" role="status" data-side={x(active!) > width * 0.6 ? "left" : "right"} style={{ left: x(active!), top: M.top }}>
          <b>{brl(a.revenueCents)}</b>
          <span>{dayLabel(a.date, { weekday: "short", day: "2-digit", month: "short" })} · {a.orders} {a.orders === 1 ? "pedido" : "pedidos"}</span>
        </div>
      )}
    </div>
  );
}

// 1, 2, 2,5 ou 5 × potência de 10: eixos com valores redondos.
function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

// Todo gráfico tem os números acessíveis sem depender do mouse.
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  if (!rows.length) return null;
  return (
    <details className="dash-table">
      <summary>Ver em tabela</summary>
      <table className="adm-table" style={{ minWidth: 0 }}>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={i ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}
