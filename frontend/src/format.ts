const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (cents: number) => brlFmt.format(cents / 100);

// "2026-10-09" → "09 out." (sem fuso: a data vem como texto puro da API)
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("pt-BR");
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const grams = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("pt-BR")} kg` : `${g} g`);

export const cepMask = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Recebido",
  confirmed: "Confirmado",
  preparing: "Em preparação",
  in_transit: "Em rota",
  delivered: "Entregue",
  cancelled: "Cancelado",
  open: "Aguardando resposta",
  answered: "Respondida",
  accepted: "Aceita",
  declined: "Recusada",
  expired: "Expirada",
  draft: "Rascunho",
  submitted: "Enviada",
  in_review: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
};
