import type { SQL } from "bun";
import { db } from "../db";
import { computeCoverage, type OrderCoverage } from "../lib/coverage";
import { AppError, conflict, notFound } from "../lib/errors";

// Estoque físico, reservas, movimentações e o fluxo de status dos pedidos.

export const OPEN_STATUSES = ["pending", "confirmed", "preparing"] as const;

export type MovementKind = "entrada" | "saida" | "perda" | "contagem" | "expedicao" | "devolucao";

// Próximos status permitidos a partir de cada status.
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

// Aplica uma variação no estoque físico e registra a movimentação. Nunca deixa o físico negativo.
export async function applyMovement(
  tx: SQL,
  m: { productId: number; kind: MovementKind; delta: number; note?: string | null; orderId?: number | null; userId?: number | null; productName?: string },
) {
  // Atualiza o físico e grava a movimentação numa ida só ao banco.
  const [row] = await tx`
    with upd as (
      update products set stock_units = stock_units + ${m.delta}, updated_at = now()
      where id = ${m.productId} and stock_units + ${m.delta} >= 0
      returning id, stock_units
    )
    insert into stock_movements (product_id, kind, quantity, stock_after, note, order_id, user_id)
    select id, ${m.kind}, ${m.delta}, stock_units, ${m.note ?? null}, ${m.orderId ?? null}, ${m.userId ?? null} from upd
    returning stock_after`;
  if (!row) {
    const [p] = await tx`select name, stock_units from products where id = ${m.productId}`;
    if (!p) throw notFound("Produto");
    throw new AppError(409, "insufficient_stock",
      `Estoque físico insuficiente de ${p.name}: há ${p.stock_units} un e a operação pede ${-m.delta} un`);
  }
  return row.stock_after as number;
}

export async function transitionOrder(
  code: string,
  to: string,
  opts: { message: string; temperatureC?: number; userId: number; force?: boolean },
) {
  // Expedir fora da fila tira estoque de pedidos mais antigos: só com confirmação explícita (force).
  if (to === "in_transit" && !opts.force) {
    const [row] = await db()`select id from orders where code = ${code}`;
    const cov = row ? (await openOrdersCoverage()).byOrder.get(row.id) : undefined;
    if (cov && cov.status !== "covered") {
      throw new AppError(409, "not_covered",
        `Pedido ${code} sem cobertura completa: faltam ${cov.shortUnits} un. Pedidos mais antigos têm prioridade no estoque.`,
        { shortUnits: cov.shortUnits });
    }
  }
  return db().begin(async (tx) => {
    const [order] = await tx`select id, status, shipped_at from orders where code = ${code} for update`;
    if (!order) throw notFound("Pedido");
    if (!ORDER_TRANSITIONS[order.status]?.includes(to)) {
      throw conflict(`Não é possível ir de "${order.status}" para "${to}"`);
    }
    const items = await tx`select product_id, units, product_name from order_items where order_id = ${order.id} order by product_id`;

    if (to === "in_transit") {
      // Expedição: a reserva vira baixa física.
      for (const it of items) {
        await applyMovement(tx, { productId: it.product_id, kind: "expedicao", delta: -it.units, orderId: order.id, userId: opts.userId, note: `Pedido ${code}` });
      }
      await tx`update orders set shipped_at = now() where id = ${order.id}`;
    }
    if (to === "cancelled") {
      // Pedido aberto: a reserva some sozinha. Já expedido: o produto volta ao físico.
      if (order.shipped_at) {
        for (const it of items) {
          await applyMovement(tx, { productId: it.product_id, kind: "devolucao", delta: it.units, orderId: order.id, userId: opts.userId, note: `Cancelamento do pedido ${code}` });
        }
      }
      for (const it of items) {
        await tx`update products set sales_count = greatest(0, sales_count - ${it.units}) where id = ${it.product_id}`;
      }
    }

    await tx`update orders set status = ${to}, updated_at = now() where id = ${order.id}`;
    await tx`
      insert into order_events (order_id, status, message, temperature_c)
      values (${order.id}, ${to}, ${opts.message}, ${opts.temperatureC ?? null})`;
    return order.id as number;
  });
}

type OpenOrderRow = { id: number; created_at: Date; items: { productId: number; units: number }[] | string };

// Cobertura de todos os pedidos abertos (por ordem de chegada) sobre o estoque físico atual.
export async function openOrdersCoverage() {
  const [orders, stock] = await Promise.all([
    db()`
      select o.id, o.created_at,
        coalesce((select json_agg(json_build_object('productId', i.product_id, 'units', i.units) order by i.id)
                  from order_items i where i.order_id = o.id), '[]'::json) as items
      from orders o where o.status in ('pending', 'confirmed', 'preparing')` as Promise<OpenOrderRow[]>,
    db()`select id, stock_units from products` as Promise<{ id: number; stock_units: number }[]>,
  ]);
  const onHand = new Map(stock.map((s) => [s.id, s.stock_units]));
  const parsed = orders.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
  }));
  const openByProduct = new Map<number, Set<number>>();
  for (const o of parsed) for (const it of o.items) {
    if (!openByProduct.has(it.productId)) openByProduct.set(it.productId, new Set());
    openByProduct.get(it.productId)!.add(o.id);
  }
  return { ...computeCoverage(parsed, onHand), openByProduct };
}

export type StockStatus = "falta" | "zerado" | "baixo" | "ok";

type InventoryRow = {
  id: number; sku: string; name: string; slug: string; imageUrl: string | null; unitLabel: string; boxSize: number;
  minStockUnits: number; active: boolean; producerName: string; onHand: number; reserved: number; available: number;
  lastMovementAt: Date | null;
};

export async function inventoryOverview() {
  const [rows, coverage] = await Promise.all([
    db()`
      select p.id, p.sku, p.name, p.slug, p.image_url as "imageUrl", p.unit_label as "unitLabel", p.box_size as "boxSize",
             p.min_stock_units as "minStockUnits", p.active, pr.name as "producerName",
             ps.on_hand as "onHand", ps.reserved, ps.available,
             (select max(created_at) from stock_movements m where m.product_id = p.id) as "lastMovementAt"
      from products p join producers pr on pr.id = p.producer_id join product_stock ps on ps.product_id = p.id
      order by p.name` as Promise<InventoryRow[]>,
    openOrdersCoverage(),
  ]);

  const products = rows.map((r) => {
    const shortUnits = coverage.shortByProduct.get(r.id) ?? 0;
    const status: StockStatus = shortUnits > 0 ? "falta" : r.available <= 0 ? "zerado" : r.available < r.minStockUnits ? "baixo" : "ok";
    return { ...r, shortUnits, openOrders: coverage.openByProduct.get(r.id)?.size ?? 0, status };
  });
  const rank: Record<StockStatus, number> = { falta: 0, zerado: 1, baixo: 2, ok: 3 };
  products.sort((a, b) => rank[a.status as StockStatus] - rank[b.status as StockStatus] || a.name.localeCompare(b.name));

  return {
    products,
    summary: {
      skus: products.length,
      withShortage: products.filter((p) => p.status === "falta").length,
      belowMinimum: products.filter((p) => p.status === "baixo" || p.status === "zerado").length,
      reservedUnits: products.reduce((acc, p) => acc + p.reserved, 0),
      onHandUnits: products.reduce((acc, p) => acc + p.onHand, 0),
    },
  };
}

export const ORDER_FILTERS = ["open", "uncovered", "in_transit", "delivered", "cancelled", "all"] as const;

export async function ordersBoard(filter: (typeof ORDER_FILTERS)[number], q?: string) {
  const statuses =
    filter === "open" || filter === "uncovered" ? [...OPEN_STATUSES]
    : filter === "all" ? ["pending", "confirmed", "preparing", "in_transit", "delivered", "cancelled"]
    : [filter];
  const term = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;

  const [rows, coverage, kpis] = await Promise.all([
    db().unsafe(
      `select o.id, o.code, o.channel, o.status, o.total_cents as "totalCents", o.created_at as "createdAt",
              o.scheduled_delivery::text as "scheduledDelivery", o.shipped_at as "shippedAt", o.cep,
              u.name as "customerName", u.email as "customerEmail", b.trade_name as "tradeName", dr.name as "region",
              coalesce((select json_agg(json_build_object('productId', i.product_id, 'name', i.product_name, 'sku', p.sku,
                         'imageUrl', p.image_url, 'mode', i.mode, 'quantity', i.quantity, 'units', i.units,
                         'totalCents', i.total_cents) order by i.id)
                        from order_items i join products p on p.id = i.product_id where i.order_id = o.id), '[]'::json) as items
       from orders o join users u on u.id = o.user_id
       left join business_accounts b on b.user_id = u.id
       left join delivery_regions dr on dr.id = o.delivery_region_id
       where o.status = any($1::text[])
         and ($2::text is null or lower(o.code) like $2 or lower(u.name) like $2 or lower(coalesce(b.trade_name, '')) like $2)
       order by o.created_at desc
       limit 200`,
      [`{${statuses.join(",")}}`, term],
    ),
    openOrdersCoverage(),
    db()`
      select
        (select count(*)::int from orders where status in ('pending', 'confirmed', 'preparing')) as "openOrders",
        (select coalesce(sum(total_cents), 0)::int from orders where status in ('pending', 'confirmed', 'preparing')) as "openValueCents",
        (select count(*)::int from orders where status = 'preparing') as "readyToShip",
        (select count(*)::int from orders where status = 'in_transit') as "inTransit",
        (select min(scheduled_delivery)::text from orders where status in ('pending', 'confirmed', 'preparing')) as "nextRoute"`,
  ]);

  let orders = rows.map((o: any) => {
    const items = typeof o.items === "string" ? JSON.parse(o.items) : o.items;
    const cov: OrderCoverage | undefined = coverage.byOrder.get(o.id);
    return {
      ...o,
      items: items.map((it: any, i: number) => ({ ...it, allocated: cov?.items[i]?.allocated ?? it.units, short: cov?.items[i]?.short ?? 0 })),
      coverage: cov ? cov.status : null,
      shortUnits: cov?.shortUnits ?? 0,
      nextStatuses: ORDER_TRANSITIONS[o.status] ?? [],
    };
  });
  if (filter === "uncovered") orders = orders.filter((o: any) => o.coverage && o.coverage !== "covered");

  const uncovered = [...coverage.byOrder.values()].filter((c) => c.status !== "covered").length;
  return { orders, summary: { ...kpis[0], uncoveredOrders: uncovered } };
}

export async function productMovements(productId: number) {
  return db()`
    select m.id, m.kind, m.quantity, m.stock_after as "stockAfter", m.note, m.created_at as "createdAt",
           o.code as "orderCode", u.name as "userName"
    from stock_movements m left join orders o on o.id = m.order_id left join users u on u.id = m.user_id
    where m.product_id = ${productId}
    order by m.created_at desc, m.id desc limit 50`;
}
