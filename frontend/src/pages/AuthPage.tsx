import { useEffect, useState } from "react";
import { api, ApiError, type User } from "../api";
import { Icon } from "../icons";
import { navigate, useLocation } from "../router";
import { useStore } from "../store";

const cnpjMask = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
};

export function AuthPage() {
  const { search } = useLocation();
  const { login, user } = useStore();
  const next = search.get("next") ?? "/";
  const [tab, setTab] = useState<"login" | "register">(search.get("tipo") ? "register" : "login");
  const [type, setType] = useState<"customer" | "business">(search.get("tipo") === "empresa" ? "business" : "customer");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", tradeName: "", cnpj: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Entrar · Encantos da Serra"; }, []);
  useEffect(() => { if (user) navigate(next, { replace: true }); }, [user, next]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "cnpj" ? cnpjMask(e.target.value) : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    try {
      const res = tab === "login"
        ? await api<{ token: string; user: User }>("/auth/login", { body: { email: form.email, password: form.password } })
        : await api<{ token: string; user: User }>("/auth/register", {
            body: {
              name: form.name, email: form.email, password: form.password, phone: form.phone || undefined, accountType: type,
              business: type === "business" ? { tradeName: form.tradeName, cnpj: form.cnpj } : undefined,
            },
          });
      login(res.token, res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.details ? "Confira os campos destacados." : err.message);
        if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field.replace("business.", ""), d.message])));
      } else setMessage("Falha de conexão");
    } finally { setBusy(false); }
  };

  const field = (k: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field" data-error={!!errors[k]}>
      <span>{label}</span>
      <input className="input" value={form[k]} onChange={set(k)} {...props} />
      {errors[k] && <small className="error">{errors[k]}</small>}
    </label>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-media">
        <img src="/images/site/rota-serra.jpg" alt="" />
        <div className="route-card"><Icon name="mountain" /><div><strong>Da serra para a sua mesa — ou para o seu negócio.</strong><small>Acompanhe pedidos, salve favoritos e acesse condições B2B.</small></div></div>
      </div>
      <div className="auth-form">
        <form onSubmit={submit} noValidate>
          <div className="tabs" role="group">
            <button type="button" aria-pressed={tab === "login"} onClick={() => setTab("login")}>Entrar</button>
            <button type="button" aria-pressed={tab === "register"} onClick={() => setTab("register")}>Criar conta</button>
          </div>
          <h1>{tab === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
          {tab === "register" && (
            <div className="mode-toggle" role="group" aria-label="Tipo de conta" style={{ justifySelf: "start" }}>
              <button type="button" aria-pressed={type === "customer"} onClick={() => setType("customer")}>Para minha casa</button>
              <button type="button" aria-pressed={type === "business"} onClick={() => setType("business")}>Empresa (B2B)</button>
            </div>
          )}
          {tab === "register" && field("name", "Seu nome", { autoComplete: "name" })}
          {tab === "register" && type === "business" && (
            <div className="form-grid cols-2">
              {field("tradeName", "Nome da empresa", { placeholder: "Ex.: Empório Vila Nova" })}
              {field("cnpj", "CNPJ", { inputMode: "numeric", placeholder: "00.000.000/0000-00" })}
            </div>
          )}
          {field("email", "E-mail", { type: "email", autoComplete: "email" })}
          {field("password", "Senha", { type: "password", autoComplete: tab === "login" ? "current-password" : "new-password", placeholder: tab === "register" ? "Mínimo de 8 caracteres" : "" })}
          {tab === "register" && field("phone", "WhatsApp (opcional)", { type: "tel" })}
          {message && <div className="notice error" role="alert">{message}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {tab === "login" ? "Entrar" : "Criar conta"} <Icon name={busy ? "loader" : "arrowRight"} className={busy ? "icon spin" : "icon"} />
          </button>
          {tab === "login" && <small className="muted">Contas de demonstração: admin@, cliente@ e compras@encantos.test (senha no backend/.env).</small>}
        </form>
      </div>
    </div>
  );
}
