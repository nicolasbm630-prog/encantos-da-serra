import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { dateTime } from "../format";
import { Icon } from "../icons";
import { Link } from "../router";
import { useApi, useStore } from "../store";
import { Dialog } from "./Dialog";
import { boxesNeeded, MOVEMENT_LABEL, STOCK_LABEL, timeAgo, unitsBoxes, type Inventory, type InventoryProduct, type Movement } from "./types";

const KINDS = [
  { id: "entrada", label: "Entrada", help: "Chegou mercadoria (coleta, compra)." },
  { id: "perda", label: "Perda", help: "Quebra, validade, peça fora do padrão." },
  { id: "saida", label: "Saída", help: "Amostra, uso interno, ajuste para baixo." },
  { id: "contagem", label: "Contagem", help: "Informe o total que você contou na câmara fria." },
] as const;

type Kind = (typeof KINDS)[number]["id"];

function StockBar({ p }: { p: InventoryProduct }) {
  // Barra = físico; a parte escura é o reservado. Se o reservado passa do físico, mostra o excesso.
  const total = Math.max(p.onHand, p.reserved, 1);
  const reservedPct = Math.min(100, (Math.min(p.reserved, p.onHand) / total) * 100);
  const freePct = Math.max(0, ((p.onHand - p.reserved) / total) * 100);
  const shortPct = p.reserved > p.onHand ? ((p.reserved - p.onHand) / total) * 100 : 0;
  const minPct = Math.min(100, (p.minStockUnits / total) * 100);
  return (
    <div className="adm-stockbar" title={`Físico ${p.onHand} · reservado ${p.reserved} · disponível ${p.available}`}>
      <span className="reserved" style={{ width: `${reservedPct}%` }} />
      <span className="free" style={{ width: `${freePct}%` }} />
      {shortPct > 0 && <span className="short" style={{ width: `${shortPct}%` }} />}
      {p.minStockUnits > 0 && <i className="min" style={{ left: `${Math.min(99, (Math.min(p.reserved, p.onHand) / total) * 100 + minPct)}%` }} />}
    </div>
  );
}

export function InventoryPage() {
  const { data, loading, reload, setData } = useApi<Inventory>("/admin/inventory");
  const [view, setView] = useState<"issues" | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<InventoryProduct | null>(null);

  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.products ?? []).filter((p) =>
      (view === "all" || p.status !== "ok") &&
      (!term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.producerName.toLowerCase().includes(term)));
  }, [data, view, q]);

  // Mantém o produto aberto no diálogo sincronizado depois de uma movimentação.
  useEffect(() => {
    if (selected && data) setSelected(data.products.find((p) => p.id === selected.id) ?? null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.summary;
  const issues = (data?.products ?? []).filter((p) => p.status !== "ok").length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Estoque</h1>
          <p><b>Físico</b> é o que está na câmara fria. <b>Reservado</b> são pedidos abertos ainda não expedidos. <b>Disponível</b> é o que a loja pode vender.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={reload} disabled={loading}>
          <Icon name={loading ? "loader" : "route"} className={loading ? "icon-sm spin" : "icon-sm"} />Atualizar
        </button>
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi" data-tone={s?.withShortage ? "alert" : "ok"}>
          <span className="adm-kpi-icon"><Icon name="box" className="icon-sm" /></span>
          <span className="adm-kpi-label">Falta para pedidos</span>
          <b>{s?.withShortage ?? "–"}</b>
          <small>{s?.withShortage ? "produtos não cobrem os pedidos abertos" : "pedidos abertos cobertos"}</small>
        </div>
        <div className="adm-kpi" data-tone={s?.belowMinimum ? "warn" : undefined}>
          <span className="adm-kpi-icon"><Icon name="trending" className="icon-sm" /></span>
          <span className="adm-kpi-label">Abaixo do mínimo</span>
          <b>{s?.belowMinimum ?? "–"}</b>
          <small>disponível menor que o mínimo</small>
        </div>
        <div className="adm-kpi">
          <span className="adm-kpi-icon"><Icon name="receipt" className="icon-sm" /></span>
          <span className="adm-kpi-label">Reservado</span>
          <b>{s ? s.reservedUnits.toLocaleString("pt-BR") : "–"}</b>
          <small>unidades em pedidos abertos</small>
        </div>
        <div className="adm-kpi">
          <span className="adm-kpi-icon"><Icon name="snowflake" className="icon-sm" /></span>
          <span className="adm-kpi-label">Físico total</span>
          <b>{s ? s.onHandUnits.toLocaleString("pt-BR") : "–"}</b>
          <small>{s?.skus ?? 0} produtos</small>
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="adm-seg" role="group" aria-label="Filtrar estoque">
          <button aria-pressed={view === "all"} onClick={() => setView("all")}>Todos</button>
          <button aria-pressed={view === "issues"} onClick={() => setView("issues")}>Precisa de atenção {issues > 0 && <span className="adm-count">{issues}</span>}</button>
        </div>
        <label className="adm-search">
          <Icon name="search" className="icon-sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, SKU ou produtor" aria-label="Buscar produtos" />
        </label>
      </div>

      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Físico</th>
                <th className="num">Reservado</th>
                <th className="num">Disponível</th>
                <th className="bar-col">Ocupação <span className="adm-legend"><i className="reserved" />reservado <i className="free" />livre <i className="short" />falta</span></th>
                <th>Situação</th>
                <th className="actions"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={7}><div className="skeleton" style={{ height: 200 }} /></td></tr>}
              {data && products.length === 0 && <tr><td colSpan={7} className="adm-empty">Nada por aqui. {view === "issues" ? "Todos os produtos estão em dia." : ""}</td></tr>}
              {products.map((p) => (
                <tr key={p.id} className="adm-row" data-stock={p.status} onClick={() => setSelected(p)}>
                  <td>
                    <span className="adm-prod">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span />}
                      <span>
                        <span className="adm-strong">{p.name}</span>
                        <small className="adm-muted">{p.sku} · {p.producerName}</small>
                      </span>
                    </span>
                  </td>
                  <td className="num"><b>{p.onHand.toLocaleString("pt-BR")}</b><small className="adm-muted">{Math.floor(p.onHand / p.boxSize)} cx</small></td>
                  <td className="num">{p.reserved.toLocaleString("pt-BR")}<small className="adm-muted">{p.openOrders} {p.openOrders === 1 ? "pedido" : "pedidos"}</small></td>
                  <td className="num"><b className={p.available < 0 ? "adm-neg" : ""}>{p.available.toLocaleString("pt-BR")}</b><small className="adm-muted">mín. {p.minStockUnits}</small></td>
                  <td className="bar-col"><StockBar p={p} /></td>
                  <td>
                    <span className="adm-stock" data-stock={p.status}>{STOCK_LABEL[p.status]}</span>
                    {p.shortUnits > 0 && <small className="adm-warn">faltam {p.shortUnits} un</small>}
                  </td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-outline" onClick={() => setSelected(p)}>Movimentar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""} wide>
        {selected && <ProductPanel product={selected} onChanged={(inv) => setData(inv)} />}
      </Dialog>
    </>
  );
}

function ProductPanel({ product: p, onChanged }: { product: InventoryProduct; onChanged: (inv: Inventory) => void }) {
  const { toast } = useStore();
  const [kind, setKind] = useState<Kind>("entrada");
  const [unit, setUnit] = useState<"unit" | "box">(p.boxSize > 1 ? "box" : "unit");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [minEdit, setMinEdit] = useState(String(p.minStockUnits));
  const movements = useApi<{ movements: Movement[] }>(`/admin/inventory/${p.id}/movements`);

  const n = Number(qty) || 0;
  const units = unit === "box" ? n * p.boxSize : n;
  const after = kind === "contagem" ? units : kind === "entrada" ? p.onHand + units : p.onHand - units;
  const invalid = qty === "" || (kind !== "contagem" && n <= 0) || after < 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    try {
      const res = await api<Inventory & { stockAfter: number }>(`/admin/inventory/${p.id}/movements`, {
        body: { kind, quantity: n, unit, note: note.trim() || undefined },
      });
      onChanged(res);
      movements.reload();
      toast({ message: `${MOVEMENT_LABEL[kind]} registrada. Físico agora: ${res.stockAfter} un.` });
      setQty(""); setNote("");
    } catch (err) {
      toast({ message: err instanceof ApiError ? err.message : "Não foi possível registrar", kind: "error" });
    } finally { setSaving(false); }
  };

  const saveMin = async () => {
    const v = Number(minEdit);
    if (!Number.isInteger(v) || v < 0 || v === p.minStockUnits) return;
    try {
      onChanged(await api<Inventory>(`/admin/inventory/${p.id}`, { method: "PATCH", body: { minStockUnits: v } }));
      toast({ message: `Mínimo de ${p.name} ajustado para ${v} un.` });
    } catch { toast({ message: "Não foi possível salvar o mínimo", kind: "error" }); }
  };

  return (
    <div className="adm-panel">
      <div className="adm-panel-stats">
        <div><span>Físico</span><b>{unitsBoxes(p.onHand, p.boxSize)}</b></div>
        <div><span>Reservado</span><b>{unitsBoxes(p.reserved, p.boxSize)}</b></div>
        <div data-neg={p.available < 0}><span>Disponível</span><b>{unitsBoxes(p.available, p.boxSize)}</b></div>
        <div>
          <span>Mínimo</span>
          <span className="adm-min">
            <input className="input" inputMode="numeric" value={minEdit} onChange={(e) => setMinEdit(e.target.value.replace(/\D/g, ""))} onBlur={saveMin}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} aria-label="Estoque mínimo em unidades" />
            <small>un</small>
          </span>
        </div>
      </div>
      {p.shortUnits > 0 && (
        <div className="adm-alert">
          <Icon name="box" className="icon-sm" />
          <div>
            <b>Faltam {p.shortUnits} un{p.boxSize > 1 ? ` (${boxesNeeded(p.shortUnits, p.boxSize)} cx)` : ""} para cobrir os pedidos abertos.</b>
            <span>Registre uma entrada ou veja os pedidos afetados em <Link to="/admin" style={{ textDecoration: "underline" }}>Pedidos › Sem cobertura</Link>.</span>
          </div>
        </div>
      )}

      <div className="adm-panel-grid">
        <form className="adm-form" onSubmit={submit}>
          <h3>Registrar movimentação</h3>
          <div className="adm-seg adm-seg-block" role="group" aria-label="Tipo de movimentação">
            {KINDS.map((k) => <button type="button" key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>
          <small className="adm-muted">{KINDS.find((k) => k.id === kind)!.help}</small>
          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <label className="field" style={{ flex: 1 }}>
              <span>{kind === "contagem" ? "Total contado" : "Quantidade"}</span>
              <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="0" autoFocus />
            </label>
            {p.boxSize > 1 && (
              <div className="adm-seg" role="group" aria-label="Unidade">
                <button type="button" aria-pressed={unit === "box"} onClick={() => setUnit("box")}>Caixas ({p.boxSize})</button>
                <button type="button" aria-pressed={unit === "unit"} onClick={() => setUnit("unit")}>Unidades</button>
              </div>
            )}
          </div>
          <label className="field">
            <span>Observação</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "perda" ? "Ex.: peças com trinca na casca" : kind === "entrada" ? "Ex.: coleta Fazenda Capão Grande" : "Opcional"} />
          </label>
          <div className="adm-preview" data-bad={after < 0}>
            Físico: <b>{p.onHand}</b> → <b>{qty === "" ? "—" : after}</b> un
            {qty !== "" && after >= 0 && <span> · disponível {after - p.reserved}{after - p.reserved < 0 ? " (ainda falta)" : ""}</span>}
            {after < 0 && <span> · não pode ficar negativo</span>}
          </div>
          <button className="btn btn-primary btn-sm" disabled={invalid || saving}>
            {saving && <Icon name="loader" className="icon-sm spin" />}Registrar {MOVEMENT_LABEL[kind]?.toLowerCase()}
          </button>
        </form>

        <div>
          <h3>Histórico</h3>
          {movements.loading && !movements.data ? <div className="skeleton" style={{ height: 160 }} /> : (
            <ol className="adm-history">
              {movements.data?.movements.map((m) => (
                <li key={m.id} data-kind={m.kind}>
                  <span className="adm-mv-qty" data-sign={m.quantity >= 0 ? "+" : "-"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</span>
                  <div>
                    <b>{MOVEMENT_LABEL[m.kind]}</b>{m.orderCode && <> · {m.orderCode}</>}
                    <small>{m.note && m.note !== `Pedido ${m.orderCode}` ? `${m.note} · ` : ""}{m.userName ? `${m.userName} · ` : ""}<span title={dateTime(m.createdAt)}>{timeAgo(m.createdAt)}</span></small>
                  </div>
                  <span className="adm-mv-after">{m.stockAfter} un</span>
                </li>
              ))}
              {movements.data?.movements.length === 0 && <li className="adm-muted">Sem movimentações.</li>}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
