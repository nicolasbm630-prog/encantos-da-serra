import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type Tier } from "../api";
import { brl, longDate, shortDate } from "../format";
import { Icon } from "../icons";
import { navigate } from "../router";
import { useDebounced, useStore } from "../store";
import { Stepper } from "./Chrome";

type CatalogItem = { id: number; sku: string; name: string; packaging: string; tiers: Tier[]; availableBoxes: number };
type Catalog = { account: null | { tradeName: string; priceTable: string; validUntil: string | null }; products: CatalogItem[] };
type PricedLine = { product: { id: number; sku: string }; boxes: number; units: number; appliedTier: Tier; unitPriceCents: number; subtotalCents: number; savingsCents: number; issue: string | null };
type Priced = { lines: PricedLine[]; totals: { boxes: number; totalCents: number; savingsCents: number } };

// Linhas iniciais iguais às do protótipo.
const DEFAULT_ROWS = [
  { sku: "CAN-MC600", boxes: 8 },
  { sku: "MAN-C200", boxes: 4 },
  { sku: "DDL-C450", boxes: 12 },
];

const tierLabel = (t: Tier) => (t.maxBoxes ? `${t.minBoxes}–${t.maxBoxes} caixas` : `${t.minBoxes}+ caixas`);

export function QuickOrder({ nextRoute }: { nextRoute?: { date: string } | null }) {
  const { user, toast } = useStore();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [sending, setSending] = useState(false);
  const debouncedRows = useDebounced(rows, 250);

  useEffect(() => {
    api<Catalog>("/wholesale/catalog").then(setCatalog).catch(() => setCatalog({ account: null, products: [] }));
  }, [user?.id]);

  const valid = debouncedRows.filter((r) => r.boxes > 0);
  useEffect(() => {
    if (valid.length === 0) { setPriced(null); return; }
    let alive = true;
    api<Priced>("/wholesale/quick-order/price", { body: { items: valid } }).then((p) => alive && setPriced(p)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(valid)]);

  const bySku = useMemo(() => new Map(catalog?.products.map((p) => [p.sku, p]) ?? []), [catalog]);
  const lineBySku = useMemo(() => new Map(priced?.lines.map((l) => [l.product.sku, l]) ?? []), [priced]);
  const tierHeads = catalog?.products[0]?.tiers ?? [{ minBoxes: 1, maxBoxes: 4 }, { minBoxes: 5, maxBoxes: 11 }, { minBoxes: 12, maxBoxes: null }] as Tier[];
  const available = catalog?.products.filter((p) => !rows.some((r) => r.sku === p.sku)) ?? [];

  const setBoxes = (sku: string, boxes: number) => setRows((rs) => rs.map((r) => (r.sku === sku ? { ...r, boxes } : r)));
  const remove = (sku: string) => setRows((rs) => rs.filter((r) => r.sku !== sku));

  const requestQuote = async () => {
    if (!user) { navigate("/entrar?tipo=empresa&next=/atacado%23pedido-rapido"); return; }
    if (user.role !== "business" && user.role !== "admin") {
      toast({ message: "Cotações são para contas B2B. Crie uma conta de empresa com CNPJ.", kind: "error" });
      return;
    }
    setSending(true);
    try {
      const { quote } = await api<{ quote: { code: string } }>("/wholesale/quotes", { body: { items: rows.filter((r) => r.boxes > 0) } });
      toast({ message: `Cotação ${quote.code} enviada. Nossa equipe responde em até 1 dia útil.`, href: "/atacado#cotacoes", hrefLabel: "Acompanhar" });
      window.dispatchEvent(new Event("quotes:changed"));
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Não foi possível enviar a cotação", kind: "error" });
    } finally { setSending(false); }
  };

  const account = catalog?.account;
  return (
    <div className="quick-card">
      <div className="quick-card-head">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="icon-circle" style={{ background: "var(--green-800)", color: "var(--gold)" }}><Icon name="receipt" className="icon-sm" /></span>
          <div>
            <strong>Pedido rápido · {account?.tradeName ?? "Simulação"}</strong>
            <small>{account ? `Tabela ${account.priceTable}${account.validUntil ? ` • validade ${longDate(account.validUntil)}` : ""}` : "Tabela B2B Sudeste • entre com sua conta B2B para pedir"}</small>
          </div>
        </div>
        {nextRoute && <span className="route-dot">Próxima rota: {shortDate(nextRoute.date)}</span>}
      </div>

      <div className="quick-table-wrap">
        <table className="quick-table">
          <thead>
            <tr>
              <th>Produto / SKU</th>
              <th>Embalagem</th>
              {tierHeads.map((t) => <th key={t.minBoxes}>{tierLabel(t)}</th>)}
              <th>Qtd. caixas</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = bySku.get(r.sku);
              const line = lineBySku.get(r.sku);
              if (!p) return null;
              return (
                <tr key={r.sku}>
                  <td className="prod">
                    <strong>{p.name}</strong>
                    <small>{p.sku} &nbsp;•&nbsp; <b>{p.availableBoxes} caixas</b></small>
                  </td>
                  <td className="muted">{p.packaging}</td>
                  {p.tiers.map((t, i) => (
                    <td key={t.minBoxes} className={`tier ${i === p.tiers.length - 1 ? "best" : ""}`} data-active={line?.appliedTier.minBoxes === t.minBoxes}>
                      <span>{brl(t.unitPriceCents)}</span>
                    </td>
                  ))}
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Stepper value={r.boxes} onChange={(v) => setBoxes(r.sku, v)} max={Math.max(p.availableBoxes, 1)} label={`caixas de ${p.name}`} />
                      <button className="remove-btn" aria-label={`Remover ${p.name}`} onClick={() => remove(r.sku)}><Icon name="trash" className="icon-sm" /></button>
                    </span>
                  </td>
                  <td><b style={{ fontWeight: 600 }}>{line ? brl(line.subtotalCents) : "—"}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {available.length > 0 && (
        <div className="add-row">
          <Icon name="plus" className="icon-sm" />
          <select aria-label="Adicionar produto ao pedido" value="" onChange={(e) => e.target.value && setRows((rs) => [...rs, { sku: e.target.value, boxes: 1 }])}>
            <option value="">Adicionar produto ao pedido…</option>
            {available.map((p) => <option key={p.sku} value={p.sku}>{p.name} — {p.packaging}</option>)}
          </select>
        </div>
      )}

      <div className="quick-foot">
        <div className="savings">
          <Icon name="checkCircle" />
          <span>Você economiza <b>{brl(priced?.totals.savingsCents ?? 0)}</b> nesta faixa.</span>
        </div>
        <div className="quick-total">
          <div>
            <small>Total estimado • {priced?.totals.boxes ?? 0} caixas</small>
            <b>{brl(priced?.totals.totalCents ?? 0)}</b>
          </div>
          <button className="btn btn-primary btn-lg" onClick={requestQuote} disabled={sending || !priced}>
            Pedir cotação <Icon name={sending ? "loader" : "arrowRight"} className={sending ? "icon spin" : "icon"} />
          </button>
        </div>
      </div>
    </div>
  );
}
