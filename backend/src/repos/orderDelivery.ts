import { config } from "../config";
import { db } from "../db";
import type { SQL } from "bun";
import { formatCep, shippingCents, todayIn, upcomingRoutes, weekdayName } from "../lib/delivery";
import { AppError, notFound } from "../lib/errors";
import type { AuthUser } from "../lib/types";
import { regionForCep } from "./delivery";
import { getOrder, type Address } from "./checkout";
import { OPEN_STATUSES } from "./inventory";

// Alterar endereço e data de entrega de um pedido que ainda não saiu para a rota.
// Regras: só pedidos abertos; até o prazo de corte da rota agendada; nova data entre as próximas rotas da região.

const ROUTE_CHOICES = 6;

type OrderRow = { id: number; user_id: number; status: string; cep: string; subtotal_cents: number; discount_cents: number;
  shipping_cents: number; total_cents: number; scheduled_delivery: string | null; cutoff_days: number | null };

// Com tx, trava a linha do pedido até o fim da transação.
async function loadOrder(code: string, user: AuthUser, tx?: SQL) {
  const sql = tx ?? db();
  const query = `
    select o.id, o.user_id, o.status, o.cep, o.subtotal_cents, o.discount_cents, o.shipping_cents, o.total_cents,
           o.scheduled_delivery::text as scheduled_delivery, dr.cutoff_days
    from orders o left join delivery_regions dr on dr.id = o.delivery_region_id
    where o.code = $1 ${tx ? "for update of o" : ""}`;
  const rows: OrderRow[] = await sql.unsafe(query, [code.toUpperCase()]);
  const order = rows[0];
  if (!order || (order.user_id !== user.id && user.role !== "admin")) throw notFound("Pedido");
  return order;
}

// Pode alterar? Até quando? (o prazo é o mesmo corte usado para aceitar pedidos na rota)
// Se a rota agendada já passou sem o pedido sair, a entrega precisa ser remarcada: fica liberado.
function changeWindow(order: OrderRow, user: AuthUser) {
  if (!(OPEN_STATUSES as readonly string[]).includes(order.status)) {
    return { canChange: false, deadline: null, reason: "O pedido já saiu para entrega. Fale com a nossa equipe.", missedRoute: false };
  }
  const today = todayIn(config().TZ_BUSINESS);
  if (!order.scheduled_delivery) return { canChange: true, deadline: null, reason: null, missedRoute: false };
  if (today > order.scheduled_delivery) return { canChange: true, deadline: null, reason: null, missedRoute: true };
  const d = new Date(`${order.scheduled_delivery}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (order.cutoff_days ?? 1));
  const deadline = d.toISOString().slice(0, 10);
  // A equipe pode ajustar depois do corte, desde que o pedido não tenha sido expedido.
  if (today > deadline && user.role !== "admin") {
    return { canChange: false, deadline, reason: "O prazo para alterar esta entrega já passou. Fale com a nossa equipe.", missedRoute: false };
  }
  return { canChange: true, deadline, reason: null, missedRoute: false };
}

async function quote(order: OrderRow, cep: string) {
  const region = await regionForCep(cep);
  const dates = upcomingRoutes(todayIn(config().TZ_BUSINESS), region.routeWeekdays, region.cutoffDays, ROUTE_CHOICES);
  const shipping = shippingCents(region, order.subtotal_cents);
  const total = order.subtotal_cents - order.discount_cents + shipping;
  return {
    region: { id: region.id, name: region.name },
    cep: formatCep(Number(cep.replace(/\D/g, ""))),
    dates: dates.map((date) => ({ date, weekday: weekdayName(date) })),
    shippingCents: shipping,
    totalCents: total,
    differenceCents: total - order.total_cents,
  };
}

export async function deliveryOptions(code: string, user: AuthUser, cep?: string) {
  const order = await loadOrder(code, user);
  const window = changeWindow(order, user);
  return { ...window, current: { cep: order.cep, scheduledDelivery: order.scheduled_delivery }, quote: window.canChange ? await quote(order, cep ?? order.cep) : null };
}

type DeliveryChange = { cep: string; address: Address; scheduledDelivery: string };

export async function changeDelivery(code: string, user: AuthUser, input: DeliveryChange) {
  const orderId = await db().begin((tx) => applyDeliveryChange(tx, code, user, input));
  return getOrder(orderId);
}

// Núcleo da alteração, dentro de uma transação já aberta (trava o pedido até o commit).
export async function applyDeliveryChange(tx: SQL, code: string, user: AuthUser, input: DeliveryChange) {
  const order = await loadOrder(code, user, tx);
  const window = changeWindow(order, user);
  if (!window.canChange) throw new AppError(409, "delivery_locked", window.reason!);
  const q = await quote(order, input.cep);
  const chosen = q.dates.find((d) => d.date === input.scheduledDelivery);
  if (!chosen) throw new AppError(422, "invalid_route_date", "Escolha uma das datas de entrega disponíveis para este CEP");

  await tx`
    update orders set cep = ${input.cep}, address = ${JSON.stringify(input.address)}::text::jsonb, delivery_region_id = ${q.region.id},
      scheduled_delivery = ${chosen.date}, shipping_cents = ${q.shippingCents}, total_cents = ${q.totalCents},
      delivery_changed_at = now(), updated_at = now()
    where id = ${order.id}`;
  const [d, m] = [chosen.date.slice(8, 10), chosen.date.slice(5, 7)];
  const who = user.role === "admin" && order.user_id !== user.id ? "pela equipe" : "pelo cliente";
  const money = q.differenceCents === 0 ? "" : ` Total ${q.differenceCents > 0 ? "aumentou" : "diminuiu"} ${(Math.abs(q.differenceCents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} pelo frete.`;
  await tx`
    insert into order_events (order_id, status, message)
    values (${order.id}, 'delivery_changed', ${`Entrega alterada ${who}: ${input.address.street}, ${input.address.number} · ${input.address.city}/${input.address.state} (CEP ${q.cep}), rota de ${chosen.weekday}, ${d}/${m}.${money}`})`;
  return order.id;
}
