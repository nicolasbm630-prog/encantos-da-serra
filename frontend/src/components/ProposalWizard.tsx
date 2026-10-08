import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { STATUS_LABEL } from "../format";
import { Icon } from "../icons";
import { useStore } from "../store";

// Proposta de fornecimento em 3 etapas, com autosave e retomada sem login.

type Options = {
  mainProductType: string[];
  milkUsed: string[];
  averageCure: string[];
  monthlyVolume: { label: string; kg: number }[];
  saleFormat: string[];
  pickupFrequency: string[];
  certifications: string[];
};

type Proposal = {
  protocol: string;
  status: string;
  currentStep: number;
  responsibleName: string | null;
  propertyName: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  mainProductType: string | null;
  milkUsed: string | null;
  averageCure: string | null;
  monthlyVolumeKg: number | null;
  saleFormat: string | null;
  pickupFrequency: string | null;
  certifications: string[];
  attachments: { id: number; name: string; mimeType: string; sizeBytes: number }[];
};

type Draft = Partial<Omit<Proposal, "protocol" | "status" | "attachments">>;

const SAVED_KEY = "eds.proposal";

// Valores iniciais iguais aos do protótipo (etapa 2).
const PROTOTYPE_DEFAULTS: Draft = {
  mainProductType: "Queijo maturado",
  milkUsed: "Vaca • leite cru",
  averageCure: "22 a 30 dias",
  monthlyVolumeKg: 480,
  saleFormat: "Peças de 600 a 700 g",
  pickupFrequency: "Quinzenal",
  certifications: ["SIM", "Artesanal"],
};

const STEPS = [
  { title: "Dados básicos", sub: "Responsável, propriedade e contatos." },
  { title: "Produto e volume mensal", sub: "Tipos, formatos, capacidade e sazonalidade." },
  { title: "Selos e certificações", sub: "SIF, SIM, SIE, Artesanal e anexos." },
];

// Campos de texto incompletos (ex.: UF com 1 letra) só vão para a API quando válidos.
const cleanDraft = (d: Draft): Draft =>
  Object.fromEntries(Object.entries(d).filter(([k, v]) =>
    v !== null && v !== undefined &&
    !(typeof v === "string" && (v.trim() === "" || (k === "state" && v.trim().length !== 2) || (k === "email" && !/^\S+@\S+\.\S+$/.test(v)))))) as Draft;

const loadSaved = (): { protocol: string; editToken: string } | null => {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null"); } catch { return null; }
};

export function ProposalWizard() {
  const { toast } = useStore();
  const [options, setOptions] = useState<Options | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(PROTOTYPE_DEFAULTS);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const session = useRef(loadSaved());
  const pending = useRef<Draft>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Options>("/supplier-proposals/options").then(setOptions).catch(() => {});
    const saved = session.current;
    if (!saved) return;
    api<{ proposal: Proposal }>(`/supplier-proposals/${saved.protocol}`, { headers: { "X-Edit-Token": saved.editToken } })
      .then(({ proposal }) => {
        if (proposal.status !== "draft") { localStorage.removeItem(SAVED_KEY); session.current = null; return; }
        setProposal(proposal);
        setStep(proposal.currentStep);
        const { protocol, status, attachments, ...rest } = proposal;
        setDraft(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))) as Draft);
        setSaving("saved");
      })
      .catch(() => { localStorage.removeItem(SAVED_KEY); session.current = null; });
  }, []);

  const ensureProposal = useCallback(async (initial: Draft) => {
    if (session.current) return session.current;
    const { editToken, proposal } = await api<{ editToken: string; proposal: Proposal }>("/supplier-proposals", { body: initial });
    session.current = { protocol: proposal.protocol, editToken };
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(session.current)); } catch { /* sem storage */ }
    setProposal(proposal);
    return session.current;
  }, []);

  const flush = useCallback(async () => {
    const changes = pending.current;
    pending.current = {};
    if (Object.keys(changes).length === 0) return;
    setSaving("saving");
    try {
      if (!session.current) await ensureProposal({ ...changes });
      else {
        const { proposal } = await api<{ proposal: Proposal }>(`/supplier-proposals/${session.current.protocol}`, {
          method: "PATCH", body: changes, headers: { "X-Edit-Token": session.current.editToken },
        });
        setProposal(proposal);
      }
      setSaving("saved");
    } catch (e) {
      setSaving("error");
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
    }
  }, [ensureProposal]);

  // Autosave: junta alterações e salva 700 ms depois da última.
  const update = (changes: Draft) => {
    setDraft((d) => ({ ...d, ...changes }));
    setErrors((errs) => { const n = { ...errs }; for (const k of Object.keys(changes)) delete n[k]; return n; });
    Object.assign(pending.current, cleanDraft(changes));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  const goTo = async (n: number) => {
    if (n > step && !validateStep(step)) return;
    // Salva o rascunho inteiro, inclusive valores pré-preenchidos que não foram tocados.
    update({ ...draft, currentStep: n });
    clearTimeout(timer.current);
    await flush();
    setStep(n);
  };

  const validateStep = (s: number) => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!draft.responsibleName?.trim()) errs.responsibleName = "Informe o responsável";
      if (!draft.propertyName?.trim()) errs.propertyName = "Informe a propriedade";
      if (!draft.city?.trim()) errs.city = "Informe a cidade";
      if (!draft.state || draft.state.trim().length !== 2) errs.state = "UF com 2 letras";
      if (!draft.email?.trim() && !draft.phone?.trim()) errs.phone = "Informe WhatsApp ou e-mail";
      if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) errs.email = "E-mail inválido";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    const tooBig = list.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) { toast({ message: `${tooBig.name} passa de 10 MB.`, kind: "error" }); return; }
    setUploading(true);
    try {
      clearTimeout(timer.current);
      await flush();
      const s = await ensureProposal(cleanDraft(draft));
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        await api(`/supplier-proposals/${s.protocol}/attachments`, { form, headers: { "X-Edit-Token": s.editToken } });
      }
      const { proposal } = await api<{ proposal: Proposal }>(`/supplier-proposals/${s.protocol}`, { headers: { "X-Edit-Token": s.editToken } });
      setProposal(proposal);
      toast({ message: list.length > 1 ? `${list.length} arquivos anexados.` : `${list[0]!.name} anexado.` });
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Falha no envio do arquivo", kind: "error" });
    } finally { setUploading(false); }
  };

  const removeAttachment = async (id: number) => {
    const s = session.current;
    if (!s) return;
    await api(`/supplier-proposals/${s.protocol}/attachments/${id}`, { method: "DELETE", headers: { "X-Edit-Token": s.editToken } });
    setProposal((p) => (p ? { ...p, attachments: p.attachments.filter((a) => a.id !== id) } : p));
  };

  const submit = async () => {
    Object.assign(pending.current, cleanDraft(draft));
    clearTimeout(timer.current);
    await flush();
    const s = await ensureProposal(cleanDraft(draft));
    try {
      const res = await api<{ proposal: Proposal; message: string }>(`/supplier-proposals/${s.protocol}/submit`, { method: "POST", headers: { "X-Edit-Token": s.editToken } });
      localStorage.removeItem(SAVED_KEY);
      session.current = null;
      setSubmitted(res.proposal.protocol);
      setProposal(res.proposal);
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        const errs = Object.fromEntries(e.details.map((d) => [d.field, d.message]));
        setErrors(errs);
        const firstStep = ["responsibleName", "propertyName", "city", "state", "email", "phone"].some((f) => errs[f]) ? 1 : 2;
        setStep(firstStep);
        toast({ message: "Faltam alguns campos — destacamos para você.", kind: "error" });
      } else toast({ message: e instanceof ApiError ? e.message : "Não foi possível enviar", kind: "error" });
    }
  };

  const toggleCert = (c: string) => {
    const set = new Set(draft.certifications ?? []);
    set.has(c) ? set.delete(c) : set.add(c);
    update({ certifications: [...set] });
  };

  const field = (key: keyof Draft, label: string, input: React.ReactNode, className = "") => (
    <label className={`field ${className}`} data-error={!!errors[key]}>
      <span>{label}</span>
      {input}
      {errors[key] && <small className="error">{errors[key]}</small>}
    </label>
  );
  const text = (key: keyof Draft, placeholder = "", type = "text") => (
    <input className="input" type={type} placeholder={placeholder} value={(draft[key] as string) ?? ""} onChange={(e) => update({ [key]: e.target.value } as Draft)} />
  );
  const select = (key: keyof Draft, values: readonly string[]) => (
    <select className="select" value={(draft[key] as string) ?? ""} onChange={(e) => update({ [key]: e.target.value } as Draft)}>
      <option value="" disabled>Selecione</option>
      {values.map((v) => <option key={v}>{v}</option>)}
    </select>
  );

  const certs = options?.certifications ?? ["SIM", "Artesanal", "SIF", "SIE"];
  const attachments = proposal?.attachments ?? [];
  const progress = submitted ? 100 : (step / 3) * 100;

  if (submitted) {
    return (
      <div className="card wizard" style={{ gridTemplateColumns: "1fr" }}>
        <div className="wizard-main" style={{ textAlign: "center", padding: "56px 24px" }}>
          <span className="icon-circle" style={{ margin: "0 auto 16px", width: 56, height: 56 }}><Icon name="checkCircle" /></span>
          <h3 style={{ fontSize: 28 }}>Proposta {submitted} enviada</h3>
          <p className="muted" style={{ maxWidth: 480, margin: "10px auto 24px" }}>Recebemos seus dados e documentos. A equipe de parcerias analisa e avisa por WhatsApp ou e-mail. Status atual: <b>{STATUS_LABEL[proposal?.status ?? "submitted"]}</b>.</p>
          <button className="btn btn-outline" onClick={() => { setSubmitted(null); setProposal(null); setDraft(PROTOTYPE_DEFAULTS); setStep(1); setSaving("idle"); }}>Enviar outra proposta</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card wizard">
      <aside className="wizard-side">
        <div>
          <span className="eyebrow" style={{ fontSize: 10.5 }}>Proposta de fornecimento</span>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <small>Etapa {step} de 3 • {saving === "saved" ? "rascunho salvo" : saving === "saving" ? "salvando…" : "rascunho"}</small>
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const state = n === step ? "current" : n < step ? "done" : "todo";
            return (
              <li key={s.title}>
                <button type="button" className="step" data-state={state} onClick={() => (n < step || n === step + 1) && goTo(n)} aria-current={n === step ? "step" : undefined}>
                  <span className="step-num">{state === "done" ? <Icon name="check" className="icon-sm" /> : n}</span>
                  <span><strong>{s.title}</strong><span>{s.sub}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="side-help">
          <Icon name="chat" className="icon-sm" />
          <span><b>Precisa de ajuda?</b>A equipe responde no WhatsApp.</span>
        </div>
      </aside>

      <div className="wizard-main">
        <div className="wizard-title">
          <div>
            <h3>{STEPS[step - 1]!.title}</h3>
            <p>{step === 1 ? "Quem é você e como falamos com você." : step === 2 ? "Valores aproximados já ajudam nossa equipe a planejar a coleta." : "Confira os selos e anexe laudos ou fotos dos certificados."}</p>
          </div>
          <span className="saved" aria-live="polite">
            <Icon name={saving === "error" ? "x" : "cloud"} className="icon-sm" />
            {saving === "saving" ? "Salvando…" : saving === "saved" ? "Salvo agora" : saving === "error" ? "Erro ao salvar" : "Salva sozinho"}
          </span>
        </div>

        {step === 1 && (
          <div className="form-grid">
            {field("responsibleName", "Responsável", text("responsibleName", "Nome completo"), "span-2")}
            {field("propertyName", "Propriedade", text("propertyName", "Sítio, fazenda ou queijaria"))}
            {field("city", "Cidade", text("city", "Ex.: Delfinópolis"), "span-2")}
            {field("state", "UF", text("state", "MG"))}
            {field("phone", "WhatsApp", text("phone", "(37) 9 9999-0000", "tel"))}
            {field("email", "E-mail", text("email", "voce@exemplo.com", "email"), "span-2")}
          </div>
        )}

        {step === 2 && (
          <>
            <div className="form-grid">
              {field("mainProductType", "Tipo principal", select("mainProductType", options?.mainProductType ?? []))}
              {field("milkUsed", "Leite utilizado", select("milkUsed", options?.milkUsed ?? []))}
              {field("averageCure", "Cura média", select("averageCure", options?.averageCure ?? []))}
              {field("monthlyVolumeKg", "Volume médio mensal", (
                <select className="select" value={draft.monthlyVolumeKg ?? ""} onChange={(e) => update({ monthlyVolumeKg: Number(e.target.value) })}>
                  <option value="" disabled>Selecione</option>
                  {(options?.monthlyVolume ?? []).map((v) => <option key={v.kg} value={v.kg}>{v.label}</option>)}
                </select>
              ))}
              {field("saleFormat", "Formato de venda", select("saleFormat", options?.saleFormat ?? []))}
              {field("pickupFrequency", "Coleta desejada", select("pickupFrequency", options?.pickupFrequency ?? []))}
            </div>
            <div className="field" style={{ marginTop: 18 }}>
              <span>Certificações disponíveis</span>
              <div className="cert-chips">
                {certs.slice(0, 4).map((c) => {
                  const on = draft.certifications?.includes(c) ?? false;
                  return <button key={c} type="button" className="cert-chip" aria-pressed={on} onClick={() => toggleCert(c)}><Icon name={on ? "check" : "plus"} className="icon-sm" />{c}</button>;
                })}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="field">
            <span>Selos e certificações</span>
            <div className="cert-chips">
              {certs.map((c) => {
                const on = draft.certifications?.includes(c) ?? false;
                return <button key={c} type="button" className="cert-chip" aria-pressed={on} onClick={() => toggleCert(c)}><Icon name={on ? "check" : "plus"} className="icon-sm" />{c}</button>;
              })}
            </div>
          </div>
        )}

        {step >= 2 && (
          <div style={{ marginTop: 18 }}>
            <div className="dropzone" data-drag={drag}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="icon-circle"><Icon name={uploading ? "loader" : "upload"} className={uploading ? "icon-sm spin" : "icon-sm"} /></span>
                <span><strong>Arraste laudos, fotos de selos ou certificados</strong><small>PDF, JPG ou PNG • até 10 MB por arquivo</small></span>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()} disabled={uploading}>Selecionar arquivos</button>
              <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
            </div>
            {attachments.length > 0 && (
              <div className="files">
                {attachments.map((a) => (
                  <div key={a.id} className="file-row">
                    <Icon name="file" className="icon-sm" />
                    <span>{a.name}</span>
                    <small className="muted">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</small>
                    <button className="remove-btn" aria-label={`Remover ${a.name}`} onClick={() => removeAttachment(a.id)}><Icon name="trash" className="icon-sm" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="wizard-foot">
          <small>
            Ao concluir: protocolo <b>{proposal?.protocol ?? "gerado ao salvar"}</b> • aviso via WhatsApp ou e-mail.
          </small>
          <div style={{ display: "flex", gap: 10 }}>
            {step > 1 && <button type="button" className="btn btn-outline" onClick={() => goTo(step - 1)}>Voltar</button>}
            {step < 3 ? (
              <button type="button" className="btn btn-primary" onClick={() => goTo(step + 1)}>
                {step === 1 ? "Continuar para produto" : "Continuar para certificações"} <Icon name="arrowRight" className="icon-sm" />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={submit}>Enviar proposta <Icon name="arrowRight" className="icon-sm" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
