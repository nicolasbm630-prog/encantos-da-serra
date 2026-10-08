import { useState } from "react";
import { api, ApiError, type DeliveryInfo } from "../api";
import { brl, cepMask, shortDate } from "../format";
import { Icon } from "../icons";

export function CepLookup() {
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<DeliveryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const digits = cep.replace(/\D/g, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length !== 8) { setError("Digite os 8 números do CEP."); setResult(null); return; }
    setLoading(true); setError(null); setResult(null);
    try { setResult(await api<DeliveryInfo>(`/delivery/cep/${digits}`)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Não foi possível consultar agora"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <form className="cep-form" onSubmit={submit}>
        <label htmlFor="cep" className="sr-only">CEP</label>
        <input id="cep" className="input" value={cep} onChange={(e) => setCep(cepMask(e.target.value))}
          placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" aria-describedby="cep-result" />
        <button className="btn btn-primary" disabled={loading}>
          {loading ? <Icon name="loader" className="icon spin" /> : "Consultar"}
        </button>
      </form>
      <div id="cep-result" aria-live="polite">
        {result && (
          <div className="cep-result">
            <b>{result.region}</b><br />
            Próxima entrega: {result.nextDelivery ? `${result.nextDelivery.weekday}, ${shortDate(result.nextDelivery.date)}` : "a confirmar"}<br />
            Frete {brl(result.feeCents)}{result.freeShippingOverCents ? ` · grátis acima de ${brl(result.freeShippingOverCents)}` : ""}
          </div>
        )}
        {error && <div className="cep-result error">{error}</div>}
      </div>
    </div>
  );
}
