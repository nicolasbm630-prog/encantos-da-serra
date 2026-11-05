import { cloneElement, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { api, ApiError } from "../api";
import { brl } from "../format";
import { Icon } from "../icons";
import { Link, navigate } from "../router";
import { useApi, useStore } from "../store";
import { fromCents, MILK_OPTIONS, toCents, type AdminProduct, type ProductOptions } from "./types";

type TierRow = { min: string; max: string; price: string };

type FormState = {
  name: string; sku: string; categoryId: string; producerId: string; description: string;
  price: string; unitLabel: string; weightGrams: string;
  boxSize: string; tiers: TierRow[];
  milkType: string; cureDays: string; detailTag: string; badge: string; awarded: boolean; shelfLifeDays: string;
  imageUrl: string; active: boolean; featured: boolean; stockUnits: string;
};

const EMPTY: FormState = {
  name: "", sku: "", categoryId: "", producerId: "", description: "",
  price: "", unitLabel: "peça", weightGrams: "", boxSize: "6",
  tiers: [{ min: "1", max: "4", price: "" }, { min: "5", max: "11", price: "" }, { min: "12", max: "", price: "" }],
  milkType: "vaca", cureDays: "", detailTag: "", badge: "", awarded: false, shelfLifeDays: "",
  imageUrl: "", active: true, featured: false, stockUnits: "",
};

const int = (v: string) => (v.trim() === "" ? NaN : Number(v));
const digits = (v: string) => v.replace(/\D/g, "");

function fromProduct(p: AdminProduct): FormState {
  return {
    name: p.name, sku: p.sku, categoryId: String(p.category.id), producerId: String(p.producer.id), description: p.description ?? "",
    price: fromCents(p.retail.priceCents), unitLabel: p.retail.unitLabel, weightGrams: String(p.weightGrams),
    boxSize: String(p.wholesale.boxSize),
    tiers: p.wholesale.tiers.map((t) => ({ min: String(t.minBoxes), max: t.maxBoxes ? String(t.maxBoxes) : "", price: fromCents(t.unitPriceCents) })),
    milkType: p.milkType, cureDays: p.cureDays != null ? String(p.cureDays) : "", detailTag: p.detailTag ?? "", badge: p.badge ?? "",
    awarded: p.awarded, shelfLifeDays: p.shelfLifeDays ? String(p.shelfLifeDays) : "", imageUrl: p.imageUrl ?? "", active: p.active, featured: p.featured, stockUnits: "",
  };
}

function validate(f: FormState, isNew: boolean) {
  const e: Record<string, string> = {};
  if (f.name.trim().length < 2) e.name = "Informe o nome do produto.";
  if (f.sku.trim().length < 3) e.sku = "O SKU precisa de pelo menos 3 caracteres.";
  if (!f.categoryId) e.categoryId = "Escolha a categoria.";
  if (!f.producerId) e.producerId = "Escolha o produtor.";
  if (!(toCents(f.price) > 0)) e.price = "Informe o preço de varejo.";
  if (f.unitLabel.trim().length < 2) e.unitLabel = "Informe a unidade de venda (ex.: peça, pote).";
  if (!(int(f.weightGrams) > 0)) e.weightGrams = "Informe o peso em gramas.";
  if (!(int(f.boxSize) > 0)) e.boxSize = "Informe quantas unidades vêm na caixa.";
  if (isNew && f.stockUnits !== "" && !(int(f.stockUnits) >= 0)) e.stockUnits = "Quantidade inválida.";
  if (f.shelfLifeDays !== "" && !(int(f.shelfLifeDays) >= 1 && int(f.shelfLifeDays) <= 3650)) e.shelfLifeDays = "Use de 1 a 3650 dias.";
  if (f.imageUrl && !/^(https?:\/\/|\/images\/)/.test(f.imageUrl)) e.imageUrl = "Use uma URL (https://…) ou um caminho /images/…";

  // Faixas em ordem, sem sobreposição, com preço; só a última pode ficar sem "até".
  f.tiers.forEach((t, i) => {
    const min = int(t.min), max = int(t.max), next = f.tiers[i + 1];
    if (!(min >= 1)) e[`tier${i}`] = "“De” precisa ser 1 ou mais.";
    else if (t.max !== "" && !(max >= min)) e[`tier${i}`] = "“Até” precisa ser maior ou igual a “De”.";
    else if (next && t.max === "") e[`tier${i}`] = "Só a última faixa pode ficar sem limite.";
    else if (next && int(next.min) !== max + 1) e[`tier${i}`] = `A próxima faixa deve começar em ${max + 1}.`;
    else if (!(toCents(t.price) > 0)) e[`tier${i}`] = "Informe o preço por unidade.";
  });
  return e;
}

function toPayload(f: FormState, isNew: boolean) {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    name: f.name.trim(), sku: f.sku.trim(), categoryId: Number(f.categoryId), producerId: Number(f.producerId),
    description: opt(f.description), retailPriceCents: toCents(f.price), unitLabel: f.unitLabel.trim(),
    weightGrams: int(f.weightGrams), boxSize: int(f.boxSize), milkType: f.milkType,
    cureDays: f.cureDays ? int(f.cureDays) : undefined, detailTag: opt(f.detailTag), badge: opt(f.badge),
    awarded: f.awarded, shelfLifeDays: f.shelfLifeDays ? int(f.shelfLifeDays) : null, imageUrl: opt(f.imageUrl), active: f.active, featured: f.featured,
    tiers: f.tiers.map((t) => ({ minBoxes: int(t.min), maxBoxes: t.max ? int(t.max) : null, unitPriceCents: toCents(t.price) })),
    ...(isNew ? { stockUnits: f.stockUnits ? int(f.stockUnits) : 0 } : {}),
  };
}

export function ProductForm({ id }: { id: number | null }) {
  const isNew = id === null;
  const { toast } = useStore();
  const options = useApi<ProductOptions>("/admin/products/options");
  const existing = useApi<{ product: AdminProduct }>(isNew ? null : `/admin/products/${id}`, [id]);
  const [f, setF] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => { if (existing.data) setF(fromProduct(existing.data.product)); }, [existing.data]);
  useEffect(() => { document.title = `${isNew ? "Novo produto" : "Editar produto"} · Painel Encantos`; }, [isNew]);

  const errors = useMemo(() => validate(f, isNew), [f, isNew]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setTier = (i: number, patch: Partial<TierRow>) => setF((s) => ({ ...s, tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const addTier = () => setF((s) => {
    const last = s.tiers.at(-1)!;
    const lastMin = int(last.min) || 1;
    // A última faixa ganha um limite e a nova começa logo depois, sem limite.
    const lastMax = last.max ? int(last.max) : lastMin + 4;
    return { ...s, tiers: [...s.tiers.slice(0, -1), { ...last, max: String(lastMax) }, { min: String(lastMax + 1), max: "", price: "" }] };
  });
  const removeTier = (i: number) => setF((s) => {
    const tiers = s.tiers.filter((_, j) => j !== i);
    if (i === s.tiers.length - 1 && tiers.length) tiers[tiers.length - 1] = { ...tiers.at(-1)!, max: "" };
    return { ...s, tiers };
  });

  // Envia a foto para o Supabase Storage (via API) e usa a URL pública devolvida.
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setUploadError("Envie uma foto JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError("A foto pode ter no máximo 5 MB."); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { url } = await api<{ url: string }>("/admin/products/image", { form });
      set("imageUrl", url);
      toast({ message: "Foto enviada." });
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const retail = toCents(f.price);
  const boxSize = int(f.boxSize);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (Object.keys(errors).length) {
      // Espera o React marcar os campos inválidos antes de levar o foco ao primeiro.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".adm-pform [aria-invalid='true']")?.focus());
      return;
    }
    setSaving(true);
    try {
      const body = toPayload(f, isNew);
      await api(isNew ? "/admin/products" : `/admin/products/${id}`, { method: isNew ? "POST" : "PUT", body });
      toast({ message: isNew ? `${body.name} cadastrado.` : `${body.name} atualizado.` });
      navigate("/admin/produtos");
    } catch (err) {
      const msg = err instanceof ApiError ? (err.details?.[0]?.message ? `${err.message}: ${err.details[0].message}` : err.message) : "Não foi possível salvar";
      setServerError(msg);
    } finally { setSaving(false); }
  };

  if (!isNew && existing.error) {
    return <div className="adm-empty">Produto não encontrado. <Link to="/admin/produtos" style={{ textDecoration: "underline" }}>Voltar aos produtos</Link></div>;
  }
  if ((!isNew && !existing.data) || !options.data) return <div className="adm-loading"><Icon name="loader" className="icon spin" /></div>;

  const o = options.data;
  const errorCount = touched ? Object.keys(errors).length : 0;

  return (
    <form className="adm-pform" onSubmit={submit} noValidate>
      <div className="adm-head">
        <div>
          <Link to="/admin/produtos" className="adm-back"><Icon name="arrowRight" className="icon-sm flip" />Produtos</Link>
          <h1>{isNew ? "Novo produto" : f.name || "Editar produto"}</h1>
        </div>
        {!isNew && existing.data?.product.active && (
          <Link to={`/produtos/${existing.data.product.slug}`} className="btn btn-outline btn-sm"><Icon name="store" className="icon-sm" />Ver na loja</Link>
        )}
      </div>

      {(errorCount > 0 || serverError) && (
        <div className="adm-alert" role="alert">
          <Icon name="x" className="icon-sm" />
          <div><b>{serverError ?? `Corrija ${errorCount === 1 ? "1 campo" : `${errorCount} campos`} para salvar.`}</b></div>
        </div>
      )}

      <div className="adm-pform-grid">
        <div className="adm-pform-main">
          <section className="adm-card adm-section">
            <h2>Identificação</h2>
            <div className="form-grid cols-2">
              <Field label="Nome do produto" error={show("name")} className="span-all">
                <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Queijo Canastra Meia Cura" />
              </Field>
              <Field label="SKU" hint="Código interno, único." error={show("sku")}>
                <input className="input" value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder="CAN-MC600" />
              </Field>
              <Field label="Categoria" error={show("categoryId")}>
                <select className="select" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">Escolha…</option>
                  {o.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Produtor" error={show("producerId")} className="span-all">
                <select className="select" value={f.producerId} onChange={(e) => set("producerId", e.target.value)}>
                  <option value="">Escolha…</option>
                  {o.producers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.city}, {p.state}</option>)}
                </select>
              </Field>
              <Field label="Descrição" hint="Aparece na página do produto." className="span-all">
                <textarea className="input" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="adm-card adm-section">
            <h2>Preço no varejo</h2>
            <div className="form-grid">
              <Field label="Preço (R$)" error={show("price")}>
                <input className="input" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Vendido por" hint="peça, pote, vidro…" error={show("unitLabel")}>
                <input className="input" value={f.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} />
              </Field>
              <Field label="Peso (g)" error={show("weightGrams")}>
                <input className="input" inputMode="numeric" value={f.weightGrams} onChange={(e) => set("weightGrams", digits(e.target.value))} placeholder="600" />
              </Field>
            </div>
          </section>

          <section className="adm-card adm-section">
            <h2>Atacado (por caixa)</h2>
            <div className="form-grid">
              <Field label="Unidades por caixa" error={show("boxSize")}>
                <input className="input" inputMode="numeric" value={f.boxSize} onChange={(e) => set("boxSize", digits(e.target.value))} />
              </Field>
            </div>
            <p className="adm-muted adm-small">O preço por unidade cai conforme a quantidade de caixas do pedido. Deixe “até” vazio na última faixa.</p>
            <div className="adm-table-wrap">
              <table className="adm-tiers">
                <thead>
                  <tr><th>De (caixas)</th><th>Até (caixas)</th><th>Preço por unidade (R$)</th><th className="num">Caixa sai por</th><th className="num">vs. varejo</th><th><span className="sr-only">Remover</span></th></tr>
                </thead>
                <tbody>
                  {f.tiers.map((t, i) => {
                    const unit = toCents(t.price);
                    const off = retail > 0 && unit > 0 ? Math.floor((1 - unit / retail) * 100) : null;
                    const err = show(`tier${i}`);
                    return (
                      <tr key={i} data-error={!!err}>
                        <td><input className="input" inputMode="numeric" value={t.min} onChange={(e) => setTier(i, { min: digits(e.target.value) })} aria-label={`Faixa ${i + 1}: de quantas caixas`} aria-invalid={!!err} /></td>
                        <td><input className="input" inputMode="numeric" value={t.max} onChange={(e) => setTier(i, { max: digits(e.target.value) })} placeholder={i === f.tiers.length - 1 ? "sem limite" : ""} aria-label={`Faixa ${i + 1}: até quantas caixas`} aria-invalid={!!err} /></td>
                        <td><input className="input" inputMode="decimal" value={t.price} onChange={(e) => setTier(i, { price: e.target.value })} placeholder="0,00" aria-label={`Faixa ${i + 1}: preço por unidade`} aria-invalid={!!err} aria-describedby={err ? `tier-err-${i}` : undefined} />
                          {err && <small className="adm-warn" id={`tier-err-${i}`}>{err}</small>}</td>
                        <td className="num">{unit > 0 && boxSize > 0 ? brl(unit * boxSize) : "—"}</td>
                        <td className="num">{off === null ? "—" : off > 0 ? `−${off}%` : off === 0 ? "igual" : <span className="adm-neg">+{-off}%</span>}</td>
                        <td className="num">
                          <button type="button" className="remove-btn" onClick={() => removeTier(i)} disabled={f.tiers.length === 1} aria-label={`Remover faixa ${i + 1}`}><Icon name="trash" className="icon-sm" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={addTier} style={{ justifySelf: "start" }}><Icon name="plus" className="icon-sm" />Adicionar faixa</button>
          </section>

          <section className="adm-card adm-section">
            <h2>Validade</h2>
            <div className="form-grid">
              <Field label="Validade (dias)" hint="Contada a partir da entrada no estoque." error={show("shelfLifeDays")}>
                <input className="input" inputMode="numeric" value={f.shelfLifeDays} onChange={(e) => set("shelfLifeDays", digits(e.target.value))} placeholder="Ex.: 15" />
              </Field>
            </div>
            <p className="adm-muted adm-small">
              O produto entra em “Precisa de atenção” no Estoque quando um lote fica a 10 dias do vencimento.
              {!isNew && " Mudar o prazo recalcula o vencimento dos lotes que já estão no estoque."}
              {" "}Referência: frescais 10 a 15 dias, queijo azul cerca de 30, curados 60 a 180, manteiga 150, doce de leite pastoso 180.
            </p>
          </section>

          <section className="adm-card adm-section">
            <h2>Características</h2>
            <div className="form-grid">
              <Field label="Tipo de leite">
                <select className="select" value={f.milkType} onChange={(e) => set("milkType", e.target.value)}>
                  {MILK_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Dias de cura" hint="Vazio se não se aplica.">
                <input className="input" inputMode="numeric" value={f.cureDays} onChange={(e) => set("cureDays", digits(e.target.value))} />
              </Field>
              <Field label="Detalhe" hint="Ex.: Leite cru, Receita de tacho">
                <input className="input" value={f.detailTag} onChange={(e) => set("detailTag", e.target.value)} />
              </Field>
              <Field label="Selo na foto" hint="Ex.: Ouro • Queijo Brasil" className="span-2">
                <input className="input" value={f.badge} onChange={(e) => set("badge", e.target.value)} />
              </Field>
              <label className="adm-check"><input type="checkbox" checked={f.awarded} onChange={(e) => set("awarded", e.target.checked)} />Produto premiado</label>
            </div>
          </section>
        </div>

        <aside className="adm-pform-side">
          <section className="adm-card adm-section">
            <h2>Na loja</h2>
            <label className="adm-check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Ativo (aparece na loja)</label>
            <label className="adm-check"><input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} />Destaque</label>
          </section>

          <section className="adm-card adm-section">
            <h2>Foto</h2>
            <div className="adm-photo"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}>
              {f.imageUrl ? <img src={f.imageUrl} alt="Prévia da foto do produto" /> : <span>Sem foto · arraste uma imagem aqui</span>}
              {uploading && <span className="adm-photo-busy"><Icon name="loader" className="icon spin" />Enviando…</span>}
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Icon name="upload" className="icon-sm" />{f.imageUrl ? "Trocar foto" : "Enviar foto"}
            </button>
            <small className="adm-muted" aria-live="polite">{uploadError ? <span className="adm-neg">{uploadError}</span> : "JPG, PNG ou WebP, até 5 MB."}</small>
            <Field label="Ou cole o endereço da imagem" error={show("imageUrl")}>
              <input className="input" value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value.trim())} placeholder="https://… ou /images/…" />
            </Field>
            {o.images.length > 0 && (
              <>
                <small className="adm-muted">Ou escolha uma foto já usada:</small>
                <div className="adm-gallery" role="group" aria-label="Fotos já usadas">
                  {o.images.map((url) => (
                    <button type="button" key={url} aria-pressed={f.imageUrl === url} onClick={() => set("imageUrl", url)} title={url}>
                      <img src={url} alt={url.split("/").pop()} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {isNew && (
            <section className="adm-card adm-section">
              <h2>Estoque inicial</h2>
              <Field label="Unidades na câmara fria" hint="Opcional. Depois, use a aba Estoque." error={show("stockUnits")}>
                <input className="input" inputMode="numeric" value={f.stockUnits} onChange={(e) => set("stockUnits", digits(e.target.value))} placeholder="0" />
              </Field>
            </section>
          )}
        </aside>
      </div>

      <div className="adm-pform-actions">
        <Link to="/admin/produtos" className="btn btn-outline">Cancelar</Link>
        <button className="btn btn-primary" disabled={saving}>
          {saving && <Icon name="loader" className="icon-sm spin" />}{isNew ? "Cadastrar produto" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

// Rótulo, dica e erro ligados ao campo por id (leitores de tela anunciam os três).
function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const describedBy = [hint && !error && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, { id, "aria-invalid": !!error, "aria-describedby": describedBy });
  return (
    <div className={`field ${className ?? ""}`} data-error={!!error}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && !error && <small className="adm-muted" id={`${id}-hint`}>{hint}</small>}
      {error && <small className="error" id={`${id}-err`}>{error}</small>}
    </div>
  );
}
