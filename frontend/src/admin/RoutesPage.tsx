import { useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { brl, cepMask, shortDate } from "../format";
import { Icon } from "../icons";
import { useApi, useStore } from "../store";
import { Dialog } from "./Dialog";
import { fromCents, toCents } from "./types";

export type Region = {
  id: number;
  name: string;
  cepRange: [string, string];
  routeWeekdays: number[];
  cutoffDays: number;
  feeCents: number;
  freeShippingOverCents: number | null;
  minTempC: number;
  maxTempC: number;
  openOrders: number;
  totalOrders: number;
  nextRoutes: { date: string; weekday: string }[];
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type FormState = { name: string; cepStart: string; cepEnd: string; weekdays: number[]; cutoffDays: string; fee: string; freeOver: string; minTemp: string; maxTemp: string };

const EMPTY: FormState = { name: "", cepStart: "", cepEnd: "", weekdays: [], cutoffDays: "1", fee: "", freeOver: "", minTemp: "2", maxTemp: "8" };

const fromRegion = (r: Region): FormState => ({
  name: r.name, cepStart: r.cepRange[0], cepEnd: r.cepRange[1], weekdays: r.routeWeekdays, cutoffDays: String(r.cutoffDays),
  fee: fromCents(r.feeCents), freeOver: r.freeShippingOverCents ? fromCents(r.freeShippingOverCents) : "",
  minTemp: String(r.minTempC), maxTemp: String(r.maxTempC),
});

// Mesma regra do backend: primeiras datas de rota a partir de hoje + prazo de corte.
function previewRoutes(weekdays: number[], cutoff: number, count = 4) {
  if (!weekdays.length || !(cutoff >= 0)) return [];
  const out: Date[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + cutoff);
  for (let i = 0; out.length < count && i < 21; i++, d.setDate(d.getDate() + 1)) if (weekdays.includes(d.getDay())) out.push(new Date(d));
  return out;
}

const daysLabel = (w: number[]) => (w.length === 7 ? "todos os dias" : w.map((d) => WEEKDAYS[d]).join(", "));

export function RoutesPage() {
  const { data, loading, setData } = useApi<{ regions: Region[] }>("/admin/regions");
  const [editing, setEditing] = useState<Region | "new" | null>(null);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Rotas de entrega</h1>
          <p>Cada região cobre uma faixa de CEP e tem dias de rota, prazo de corte e frete. O cliente vê as datas e o frete a partir do CEP; quando faixas se cruzam, vale a mais estreita.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" className="icon-sm" />Nova região</button>
      </div>

      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Região</th>
                <th>Faixa de CEP</th>
                <th>Dias de rota</th>
                <th className="num">Pedir até</th>
                <th className="num">Frete</th>
                <th>Próximas entregas</th>
                <th className="actions"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={7}><div className="skeleton" style={{ height: 160 }} /></td></tr>}
              {data && data.regions.length === 0 && <tr><td colSpan={7} className="adm-empty">Nenhuma região cadastrada. Sem região, nenhum CEP recebe entrega.</td></tr>}
              {data?.regions.map((r) => (
                <tr key={r.id} className="adm-row" onClick={() => setEditing(r)}>
                  <td>
                    <span className="adm-strong">{r.name}</span>
                    <small className="adm-muted">{r.openOrders ? `${r.openOrders} ${r.openOrders === 1 ? "pedido aberto" : "pedidos abertos"}` : "sem pedidos abertos"} · {r.minTempC}–{r.maxTempC} °C</small>
                  </td>
                  <td className="nowrap">{r.cepRange[0]} a {r.cepRange[1]}</td>
                  <td><span className="adm-days">{WEEKDAYS.map((d, i) => <i key={d} data-on={r.routeWeekdays.includes(i)} aria-hidden="true">{d[0]}</i>)}</span><span className="sr-only">{daysLabel(r.routeWeekdays)}</span></td>
                  <td className="num">{r.cutoffDays === 0 ? "no dia" : `${r.cutoffDays} ${r.cutoffDays === 1 ? "dia" : "dias"} antes`}</td>
                  <td className="num">{r.feeCents ? brl(r.feeCents) : "Grátis"}{r.freeShippingOverCents && <small className="adm-muted">grátis acima de {brl(r.freeShippingOverCents)}</small>}</td>
                  <td>{r.nextRoutes.map((d) => shortDate(d.date)).join(" · ") || "—"}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-outline" onClick={() => setEditing(r)} aria-label={`Editar ${r.name}`}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nova região" : editing ? `Editar ${editing.name}` : ""}>
        {editing !== null && (
          <RegionForm region={editing === "new" ? null : editing}
            onSaved={(regions) => { setData({ regions }); setEditing(null); }} onCancel={() => setEditing(null)} />
        )}
      </Dialog>
    </>
  );
}

function RegionForm({ region, onSaved, onCancel }: { region: Region | null; onSaved: (regions: Region[]) => void; onCancel: () => void }) {
  const { toast } = useStore();
  const [f, setF] = useState<FormState>(region ? fromRegion(region) : EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggleDay = (d: number) => set("weekdays", f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort());

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const digits = (v: string) => v.replace(/\D/g, "");
    if (f.name.trim().length < 2) e.name = "Dê um nome para a região.";
    if (digits(f.cepStart).length !== 8) e.cepStart = "CEP com 8 dígitos.";
    if (digits(f.cepEnd).length !== 8) e.cepEnd = "CEP com 8 dígitos.";
    else if (!e.cepStart && Number(digits(f.cepEnd)) < Number(digits(f.cepStart))) e.cepEnd = "Precisa ser maior ou igual ao inicial.";
    if (!f.weekdays.length) e.weekdays = "Escolha pelo menos um dia.";
    const cut = Number(f.cutoffDays);
    if (f.cutoffDays === "" || !Number.isInteger(cut) || cut < 0 || cut > 14) e.cutoffDays = "De 0 a 14 dias.";
    if (!(toCents(f.fee) >= 0)) e.fee = "Informe o frete (0 para grátis).";
    if (f.freeOver && !(toCents(f.freeOver) > 0)) e.freeOver = "Valor inválido.";
    if (!(Number(f.maxTemp) > Number(f.minTemp))) e.maxTemp = "Máxima precisa ser maior que a mínima.";
    return e;
  }, [f]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const preview = previewRoutes(f.weekdays, Number(f.cutoffDays));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true); setServerError(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(), cepStart: f.cepStart, cepEnd: f.cepEnd, routeWeekdays: f.weekdays, cutoffDays: Number(f.cutoffDays),
        feeCents: toCents(f.fee), freeShippingOverCents: f.freeOver ? toCents(f.freeOver) : null,
        minTempC: Number(f.minTemp.replace(",", ".")), maxTempC: Number(f.maxTemp.replace(",", ".")),
      };
      const res = await api<{ regions: Region[]; overlapping: string[] }>(region ? `/admin/regions/${region.id}` : "/admin/regions", { method: region ? "PUT" : "POST", body });
      onSaved(res.regions);
      toast({ message: res.overlapping.length ? `${body.name} salva. A faixa de CEP cruza com: ${res.overlapping.join(", ")} (vale a mais estreita).` : `${body.name} salva.` });
    } catch (err) {
      setServerError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : "Não foi possível salvar");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!region) return;
    setSaving(true); setServerError(null);
    try {
      const res = await api<{ regions: Region[] }>(`/admin/regions/${region.id}`, { method: "DELETE" });
      onSaved(res.regions);
      toast({ message: `${region.name} excluída.` });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Não foi possível excluir");
    } finally { setSaving(false); setConfirmDelete(false); }
  };

  const field = (k: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={f[k] as string} aria-invalid={!!show(k)} {...props}
        onChange={(e) => set(k, (k === "cepStart" || k === "cepEnd" ? cepMask(e.target.value) : e.target.value) as never)} />
      {show(k) && <small className="error">{show(k)}</small>}
    </label>
  );

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      {field("name", "Nome da região", { placeholder: "Ex.: Sul de Minas" })}
      <div className="form-grid cols-2">
        {field("cepStart", "CEP inicial", { inputMode: "numeric", placeholder: "37000-000" })}
        {field("cepEnd", "CEP final", { inputMode: "numeric", placeholder: "37999-999" })}
      </div>

      <div className="field">
        <span id="route-days">Dias de rota</span>
        <div className="adm-seg adm-seg-block" role="group" aria-labelledby="route-days">
          {WEEKDAYS.map((d, i) => (
            <button type="button" key={d} aria-pressed={f.weekdays.includes(i)} onClick={() => toggleDay(i)} aria-label={WEEKDAY_NAMES[i]}>{d}</button>
          ))}
        </div>
        {show("weekdays") && <small className="error">{show("weekdays")}</small>}
      </div>

      <div className="form-grid cols-2">
        {field("cutoffDays", "Prazo de corte (dias antes da rota)", { inputMode: "numeric" })}
        {field("fee", "Frete (R$)", { inputMode: "decimal", placeholder: "0,00" })}
        {field("freeOver", "Frete grátis acima de (R$, opcional)", { inputMode: "decimal", placeholder: "Sem frete grátis" })}
        <div className="form-grid cols-2" style={{ gap: 10 }}>
          {field("minTemp", "Temp. mín. (°C)", { inputMode: "decimal" })}
          {field("maxTemp", "Temp. máx. (°C)", { inputMode: "decimal" })}
        </div>
      </div>

      <div className="adm-preview" aria-live="polite">
        {preview.length
          ? <>Um pedido feito hoje entra na rota de <b>{preview[0]!.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</b>. Seguintes: {preview.slice(1).map((d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })).join(", ")}.</>
          : "Escolha os dias de rota para ver as próximas entregas."}
      </div>

      {serverError && <div className="adm-alert" role="alert"><Icon name="x" className="icon-sm" /><div><b>{serverError}</b></div></div>}

      <div className="adm-form-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        {region ? (
          confirmDelete
            ? <span style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-sm adm-btn-danger" onClick={remove} disabled={saving}>Confirmar exclusão</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfirmDelete(false)}>Manter</button>
              </span>
            : <button type="button" className="btn btn-sm adm-btn-ghost-danger" onClick={() => setConfirmDelete(true)} disabled={region.totalOrders > 0}
                title={region.totalOrders > 0 ? "Regiões com pedidos não podem ser excluídas" : undefined}>Excluir região</button>
        ) : <span />}
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-sm btn-primary" disabled={saving}>{saving && <Icon name="loader" className="icon-sm spin" />}Salvar</button>
        </span>
      </div>
      {region && region.totalOrders > 0 && <small className="adm-muted">Esta região tem {region.totalOrders} {region.totalOrders === 1 ? "pedido" : "pedidos"} e não pode ser excluída, só editada.</small>}
    </form>
  );
}
