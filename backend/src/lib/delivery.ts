import { badRequest } from "./errors";
import { onlyDigits } from "./text";

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function parseCep(cep: string): number {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) throw badRequest("CEP inválido — use 8 dígitos");
  return Number(digits);
}

export function formatCep(cep: number): string {
  const s = String(cep).padStart(8, "0");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

// Data de hoje (YYYY-MM-DD) no fuso do negócio, para não virar o dia às 21h no UTC.
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(isoDate: string, days: number): Date {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Próximas datas de rota respeitando o prazo de corte (pedido entra até N dias antes).
export function upcomingRoutes(fromIsoDate: string, weekdays: number[], cutoffDays: number, count = 1): string[] {
  if (weekdays.length === 0) return [];
  const result: string[] = [];
  for (let offset = cutoffDays; result.length < count && offset < cutoffDays + 7 * count + 7; offset++) {
    const d = addDays(fromIsoDate, offset);
    if (weekdays.includes(d.getUTCDay())) result.push(iso(d));
  }
  return result;
}

export function weekdayName(isoDate: string): string {
  return WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()]!;
}

export function shippingCents(
  region: { feeCents: number; freeShippingOverCents: number | null },
  subtotalCents: number,
): number {
  if (region.freeShippingOverCents !== null && subtotalCents >= region.freeShippingOverCents) return 0;
  return region.feeCents;
}
