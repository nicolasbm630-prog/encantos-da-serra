import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { Link } from "../router";
import { useStore } from "../store";

const COOKIE_KEY = "eds.cookies";

export function CookieBanner() {
  const [choice, setChoice] = useState<string | null>("pending");
  useEffect(() => { try { setChoice(localStorage.getItem(COOKIE_KEY)); } catch { setChoice(null); } }, []);
  if (choice) return null;
  const decide = (value: "essential" | "all") => {
    try { localStorage.setItem(COOKIE_KEY, value); } catch { /* sem storage */ }
    setChoice(value);
  };
  return (
    <div className="cookie" role="region" aria-label="Aviso de cookies">
      <div className="container">
        <p>Usamos cookies essenciais para o site funcionar. Você também aceita cookies de análise e marketing?</p>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => decide("essential")}>Só os essenciais</button>
          <button className="btn btn-outline" onClick={() => decide("all")}>Aceitar todos</button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          <Icon name={t.kind === "error" ? "x" : "checkCircle"} className="icon-sm" />
          <div style={{ flex: 1 }}>
            {t.message}
            {t.href && <> <Link to={t.href} onClick={() => dismiss(t.id)}>{t.hrefLabel ?? "Abrir"}</Link></>}
          </div>
          <button className="btn-ghost" style={{ color: "inherit", opacity: .7 }} aria-label="Fechar" onClick={() => dismiss(t.id)}><Icon name="x" className="icon-sm" /></button>
        </div>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min));
  return (
    <span className="stepper">
      <button type="button" aria-label={`Diminuir ${label}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}><Icon name="minus" className="icon-sm" /></button>
      <input type="number" value={value} aria-label={label} min={min} max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value)))} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label={`Aumentar ${label}`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}><Icon name="plus" className="icon-sm" /></button>
    </span>
  );
}
