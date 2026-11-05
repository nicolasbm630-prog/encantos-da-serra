import { config } from "../config";
import { db } from "../db";
import { inventoryOverview } from "./inventory";

// Números do dashboard do painel. Venda = pedido não cancelado; datas no fuso do negócio.

const SOLD = "o.status <> 'cancelled'";

type Range = { from: Date | null; to: Date; prevFrom: Date | null };

// days = 0 → desde o primeiro pedido (sem período anterior para comparar).
function rangeFor(days: number): Range {
  const to = new Date();
  if (!days) return { from: null, to, prevFrom: null };
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to, prevFrom: new Date(from.getTime() - days * 86_400_000) };
}

async function totals(from: Date | null, to: Date) {
  const [row] = await db()`
    select coalesce(sum(o.total_cents), 0)::float8 as "revenueCents", count(*)::int as orders,
           count(distinct o.user_id)::int as customers,
           coalesce((select sum(i.units) from order_items i join orders o2 on o2.id = i.order_id
                     where o2.status <> 'cancelled' and (${from}::timestamptz is null or o2.created_at >= ${from}) and o2.created_at < ${to}), 0)::int as units
    from orders o
    where o.status <> 'cancelled' and (${from}::timestamptz is null or o.created_at >= ${from}) and o.created_at < ${to}`;
  return { ...row, avgTicketCents: row.orders ? Math.round(row.revenueCents / row.orders) : 0 };
}

export async function analytics(days: number) {
  const r = rangeFor(days);
  const tz = config().TZ_BUSINESS;
  const where = `${SOLD} and ($1::timestamptz is null or o.created_at >= $1) and o.created_at < $2`;
  const params = [r.from, r.to];

  const [current, previous, daily, channels, products, categories, regions, statuses, inventory, pending] = await Promise.all([
    totals(r.from, r.to),
    r.prevFrom ? totals(r.prevFrom, r.from!) : Promise.resolve(null),
    // Uma linha por dia do período, inclusive dias sem venda (zero).
    db().unsafe(`
      with bounds as (
        select coalesce(($1::timestamptz at time zone '${tz}')::date,
                        (select min(o.created_at at time zone '${tz}')::date from orders o where ${SOLD}),
                        (now() at time zone '${tz}')::date) as d0,
               ($2::timestamptz at time zone '${tz}')::date as d1
      )
      select to_char(d.day, 'YYYY-MM-DD') as date,
             coalesce(sum(o.total_cents), 0)::float8 as "revenueCents", count(o.id)::int as orders
      from bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') as d(day)
      left join orders o on (o.created_at at time zone '${tz}')::date = d.day::date and ${SOLD}
        and ($1::timestamptz is null or o.created_at >= $1) and o.created_at < $2
      group by d.day order by d.day`, params),
    db().unsafe(`
      select o.channel, coalesce(sum(o.total_cents), 0)::float8 as "revenueCents", count(*)::int as orders
      from orders o where ${where} group by o.channel`, params),
    db().unsafe(`
      select i.product_id as id, max(i.product_name) as name, sum(i.total_cents)::float8 as "revenueCents", sum(i.units)::int as units
      from order_items i join orders o on o.id = i.order_id where ${where}
      group by i.product_id order by 3 desc limit 8`, params),
    db().unsafe(`
      select c.name, sum(i.total_cents)::float8 as "revenueCents", sum(i.units)::int as units
      from order_items i join orders o on o.id = i.order_id join products p on p.id = i.product_id join categories c on c.id = p.category_id
      where ${where} group by c.id, c.name order by 2 desc`, params),
    db().unsafe(`
      select coalesce(dr.name, 'Sem região') as name, sum(o.total_cents)::float8 as "revenueCents", count(*)::int as orders
      from orders o left join delivery_regions dr on dr.id = o.delivery_region_id
      where ${where} group by dr.name order by 2 desc`, params),
    // Situação dos pedidos do período, inclusive cancelados.
    db().unsafe(`
      select o.status, count(*)::int as orders, coalesce(sum(o.total_cents), 0)::float8 as "revenueCents"
      from orders o where ($1::timestamptz is null or o.created_at >= $1) and o.created_at < $2 group by o.status`, params),
    inventoryOverview(),
    db()`
      select (select count(*)::int from quote_requests where status = 'open') as "openQuotes",
             (select count(*)::int from supplier_proposals where status in ('submitted', 'in_review')) as "proposalsToReview",
             (select count(*)::int from contact_messages where not handled) as "unreadMessages"`,
  ]);

  // Estoque: valor do físico a preço de varejo e situação da validade (fotografia de agora, não depende do período).
  const prices = new Map<number, number>((await db()`select id, retail_price_cents from products`).map((p: any) => [p.id, p.retail_price_cents]));
  const stock = inventory.products.reduce(
    (acc, p) => {
      const price = prices.get(p.id) ?? 0;
      acc.valueCents += Math.max(0, p.onHand) * price;
      acc.expiredValueCents += p.expiredUnits * price;
      return acc;
    },
    { valueCents: 0, expiredValueCents: 0 },
  );

  return {
    days,
    current,
    previous,
    daily,
    channels,
    products,
    categories,
    regions,
    statuses,
    stock: {
      ...stock,
      onHandUnits: inventory.summary.onHandUnits,
      expiredUnits: inventory.summary.expiredUnits,
      expiringProducts: inventory.summary.expiring,
      belowMinimum: inventory.summary.belowMinimum,
      withShortage: inventory.summary.withShortage,
    },
    pending: pending[0],
  };
}
