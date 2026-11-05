import { config } from "../config";
import { db } from "../db";
import { formatCep, todayIn, upcomingRoutes, weekdayName } from "../lib/delivery";
import { AppError, notFound } from "../lib/errors";
import { pgIntArray } from "../lib/query";

// Regiões de entrega (faixa de CEP, dias de rota, prazo de corte, frete) para o painel.

export type RegionInput = {
  name: string;
  cepStart: number;
  cepEnd: number;
  routeWeekdays: number[];
  cutoffDays: number;
  feeCents: number;
  freeShippingOverCents: number | null;
  minTempC: number;
  maxTempC: number;
};

export async function listRegions() {
  const today = todayIn(config().TZ_BUSINESS);
  const rows = await db()`
    select r.id, r.name, r.cep_start as "cepStart", r.cep_end as "cepEnd", r.route_weekdays as "routeWeekdays",
           r.cutoff_days as "cutoffDays", r.fee_cents as "feeCents", r.free_shipping_over_cents as "freeShippingOverCents",
           r.min_temp_c::float as "minTempC", r.max_temp_c::float as "maxTempC",
           (select count(*)::int from orders o where o.delivery_region_id = r.id and o.status in ('pending', 'confirmed', 'preparing')) as "openOrders",
           (select count(*)::int from orders o where o.delivery_region_id = r.id) as "totalOrders"
    from delivery_regions r order by r.cep_start`;
  return rows.map((r: any) => ({
    ...r,
    // O driver pode devolver int[] como Int32Array, que vira {"0": 5} no JSON.
    routeWeekdays: Array.from(r.routeWeekdays as ArrayLike<number>),
    cepRange: [formatCep(r.cepStart), formatCep(r.cepEnd)],
    nextRoutes: upcomingRoutes(today, r.routeWeekdays, r.cutoffDays, 3).map((date) => ({ date, weekday: weekdayName(date) })),
  }));
}

// Faixas que se cruzam com outra região (o CEP cai na faixa mais estreita; avisamos, não bloqueamos).
async function overlaps(input: RegionInput, ignoreId?: number) {
  return db()`
    select name from delivery_regions
    where cep_start <= ${input.cepEnd} and cep_end >= ${input.cepStart} and id <> ${ignoreId ?? 0}
    order by cep_start`;
}

export async function saveRegion(input: RegionInput, id?: number) {
  const weekdays = pgIntArray([...new Set(input.routeWeekdays)].sort());
  if (id === undefined) {
    const [row] = await db()`
      insert into delivery_regions (name, cep_start, cep_end, route_weekdays, cutoff_days, fee_cents, free_shipping_over_cents, min_temp_c, max_temp_c)
      values (${input.name}, ${input.cepStart}, ${input.cepEnd}, ${weekdays}::int[], ${input.cutoffDays}, ${input.feeCents},
              ${input.freeShippingOverCents}, ${input.minTempC}, ${input.maxTempC})
      returning id`;
    id = row.id as number;
  } else {
    const [row] = await db()`
      update delivery_regions set name = ${input.name}, cep_start = ${input.cepStart}, cep_end = ${input.cepEnd},
        route_weekdays = ${weekdays}::int[], cutoff_days = ${input.cutoffDays}, fee_cents = ${input.feeCents},
        free_shipping_over_cents = ${input.freeShippingOverCents}, min_temp_c = ${input.minTempC}, max_temp_c = ${input.maxTempC}
      where id = ${id} returning id`;
    if (!row) throw notFound("Região");
  }
  const overlapping = (await overlaps(input, id)).map((r: { name: string }) => r.name);
  return { id, overlapping };
}

// Só exclui região sem pedidos: os pedidos guardam a região de entrega.
export async function deleteRegion(id: number) {
  const [used] = await db()`select count(*)::int as n from orders where delivery_region_id = ${id}`;
  if (used.n > 0) {
    throw new AppError(409, "region_in_use", `Esta região tem ${used.n} ${used.n === 1 ? "pedido" : "pedidos"}. Edite a região em vez de excluir.`);
  }
  const [row] = await db()`delete from delivery_regions where id = ${id} returning id`;
  if (!row) throw notFound("Região");
}
