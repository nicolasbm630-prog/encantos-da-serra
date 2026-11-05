import { useEffect, useState } from "react";
import { api, ApiError, type Address, type DeliveryOptions, type Order } from "../api";
import { brl, cepMask, longDate, shortDate } from "../format";
import { Icon } from "../icons";
import { useStore } from "../store";

const EMPTY_ADDRESS: Address = { recipient: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

const FIELDS: { key: keyof Address; label: string; className?: string; autoComplete: string }[] = [
  { key: "recipient", label: "Quem vai receber", className: "span-all", autoComplete: "name" },
  { key: "street", label: "Rua", className: "span-2", autoComplete: "address-line1" },
  { key: "number", label: "Número", autoComplete: "off" },
  { key: "complement", label: "Complemento (opcional)", autoComplete: "address-line2" },
  { key: "district", label: "Bairro", autoComplete: "address-level3" },
  { key: "city", label: "Cidade", autoComplete: "address-level2" },
  { key: "state", label: "UF", autoComplete: "address-level1" },
];

// Cliente muda endereço e/ou data da rota enquanto o pedido não sai para entrega.
export function ChangeDelivery({ order, onChanged }: { order: Order; onChanged: (o: Order) => void }) {
  const { toast } = useStore();
  const [options, setOptions] = useState<DeliveryOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [cep, setCep] = useState(cepMask(order.cep));
  const [address, setAddress] = useState<Address>({ ...EMPTY_ADDRESS, ...order.address });
  const [date, setDate] = useState(order.scheduledDelivery ?? "");
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (forCep?: string) => {
    setQuoting(true); setError(null);
    try {
      const q = forCep ? `?cep=${forCep.replace(/\D/g, "")}` : "";
      const res = await api<DeliveryOptions>(`/orders/${order.code}/delivery-options${q}`);
      setOptions(res);
      // Mantém a data escolhida se ela existir no novo CEP; senão, a primeira rota disponível.
      const dates = res.quote?.dates.map((d) => d.date) ?? [];
      setDate((cur) => (dates.includes(cur) ? cur : dates[0] ?? ""));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível consultar a entrega");
      setOptions((o) => (o ? { ...o, quote: null } : o));
    } finally { setQuoting(false); }
  };

  useEffect(() => { load(); }, [order.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fechar sem salvar volta ao endereço e às opções do pedido.
  const close = () => {
    setOpen(false); setError(null);
    setCep(cepMask(order.cep)); setAddress({ ...EMPTY_ADDRESS, ...order.address }); setDate(order.scheduledDelivery ?? "");
    load();
  };

  // Recalcula frete e datas quando o CEP fica completo.
  useEffect(() => {
    const digits = cep.replace(/\D/g, "");
    if (open && digits.length === 8 && digits !== options?.quote?.cep.replace(/\D/g, "")) load(digits);
  }, [cep, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!options) return null;
  if (!options.canChange) {
    return options.reason && ["pending", "confirmed", "preparing"].includes(order.status)
      ? <div className="notice" style={{ marginTop: 16 }}>{options.reason}</div>
      : null;
  }

  const q = options.quote;
  const missing = FIELDS.filter((f) => f.key !== "complement" && !String(address[f.key] ?? "").trim());
  const invalid = !q || !date || missing.length > 0 || address.state.trim().length !== 2;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setError(missing.length ? `Preencha: ${missing.map((f) => f.label.toLowerCase()).join(", ")}.` : "Escolha uma data de entrega."); return; }
    setSaving(true); setError(null);
    try {
      const { order: updated } = await api<{ order: Order }>(`/orders/${order.code}/delivery`, {
        method: "PATCH",
        body: { cep, address: { ...address, complement: address.complement?.trim() || undefined }, scheduledDelivery: date },
      });
      onChanged(updated);
      setOpen(false);
      toast({ message: `Entrega reagendada para ${shortDate(date)}.` });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar");
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <div className="card change-delivery-cta">
        <div>
          <strong>{options.missedRoute ? "A rota prevista passou sem envio" : "Precisa mudar o endereço ou o dia da entrega?"}</strong>
          <span className="muted">
            {options.missedRoute ? "Escolha uma nova data de entrega (e, se quiser, outro endereço)."
              : options.deadline ? `Você pode alterar até ${longDate(options.deadline)}.` : "Você pode alterar enquanto o pedido não sai para entrega."}
          </span>
        </div>
        <button className={`btn ${options.missedRoute ? "btn-primary" : "btn-outline"}`} onClick={() => setOpen(true)}><Icon name="truck" className="icon-sm" />{options.missedRoute ? "Remarcar entrega" : "Alterar entrega"}</button>
      </div>
    );
  }

  return (
    <form className="card change-delivery" onSubmit={save} noValidate>
      <div className="change-delivery-head">
        <h2>Alterar entrega</h2>
        <button type="button" className="btn-ghost" onClick={close} aria-label="Fechar"><Icon name="x" className="icon-sm" /></button>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>CEP</span>
          <input className="input" value={cep} onChange={(e) => setCep(cepMask(e.target.value))} inputMode="numeric" autoComplete="postal-code" />
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className={`field ${f.className ?? ""}`}>
            <span>{f.label}</span>
            <input className="input" value={address[f.key] ?? ""} autoComplete={f.autoComplete} maxLength={f.key === "state" ? 2 : undefined}
              onChange={(e) => setAddress((a) => ({ ...a, [f.key]: f.key === "state" ? e.target.value.toUpperCase() : e.target.value }))} />
          </label>
        ))}
      </div>

      <fieldset className="date-options" disabled={quoting || !q}>
        <legend>Dia da entrega {q && <span className="muted">· {q.region.name}</span>}</legend>
        {quoting && <span className="muted"><Icon name="loader" className="icon-sm spin" /> Consultando rotas…</span>}
        {!quoting && q && (
          <div className="date-grid">
            {q.dates.map((d) => (
              <label key={d.date} className="date-opt">
                <input type="radio" name="delivery-date" value={d.date} checked={date === d.date} onChange={() => setDate(d.date)} />
                <span><b>{shortDate(d.date)}</b><small>{d.weekday}</small></span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {q && (
        <div className="notice" aria-live="polite">
          Frete {q.shippingCents ? brl(q.shippingCents) : "grátis"} · total {brl(q.totalCents)}
          {q.differenceCents !== 0 && <b> ({q.differenceCents > 0 ? "+" : "−"}{brl(Math.abs(q.differenceCents))} em relação ao pedido)</b>}
        </div>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}

      <div className="change-delivery-actions">
        <button type="button" className="btn btn-outline" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving || quoting || !q}>
          {saving && <Icon name="loader" className="icon-sm spin" />}Confirmar alteração
        </button>
      </div>
    </form>
  );
}
