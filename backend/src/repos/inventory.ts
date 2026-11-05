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
    returning id, stock_after`;
  if (!row) {
    const [p] = await tx`select name, stock_units from products where id = ${m.productId}`;
    if (!p) throw notFound("Produto");
    throw new AppError(409, "insufficient_stock",
      `Estoque físico insuficiente de ${p.name}: há ${p.stock_units} un e a operação pede ${-m.delta} un`);
  }
  if (m.delta > 0) await addToBatches(tx, m.productId, row.id, m.delta, m.kind === "devolucao" ? m.orderId : null);
  if (m.delta < 0) await takeFromBatches(tx, m.productId, row.id, -m.delta, m.kind === "expedicao");
  return row.stock_after as number;
}

// Saída: consome primeiro o lote que vence antes (FEFO) e registra de qual lote saiu.
// Expedição só usa lotes dentro da validade: produto vencido nunca vai para o cliente.
async function takeFromBatches(tx: SQL, productId: number, movementId: number, units: number, validOnly = false) {
  const batches = await tx`
    select id, quantity from stock_batches
    where product_id = ${productId} and quantity > 0 and (${!validOnly} or expires_at is null or expires_at > now())
    order by expires_at nulls last, received_at, id for update`;
  let need = units;
  for (const b of batches) {
    if (need === 0) break;
    const take = Math.min(need, b.quantity);
    await tx`update stock_batches set quantity = quantity - ${take} where id = ${b.id}`;
    await tx`insert into stock_batch_moves (movement_id, batch_id, quantity) values (${movementId}, ${b.id}, ${-take})`;
    need -= take;
  }
  if (need > 0 && validOnly) {
    const [p] = await tx`select name from products where id = ${productId}`;
    throw new AppError(409, "expired_stock",
      `Estoque dentro da validade insuficiente de ${p?.name}: faltam ${need} un. Registre a perda das vencidas e uma nova entrada.`);
  }
}

// Entrada: novo lote que vence em "agora + validade do produto". Devolução de pedido volta aos lotes de origem.
async function addToBatches(tx: SQL, productId: number, movementId: number, units: number, orderId?: number | null) {
  let left = units;
  if (orderId) {
    const origins = await tx`
      select bm.batch_id, sum(-bm.quantity)::int as units
      from stock_batch_moves bm join stock_movements sm on sm.id = bm.movement_id
      where sm.order_id = ${orderId} and sm.product_id = ${productId} and sm.kind = 'expedicao' and bm.quantity < 0
      group by bm.batch_id order by bm.batch_id`;
    for (const o of origins) {
      if (left === 0) break;
      const back = Math.min(left, o.units);
      await tx`update stock_batches set quantity = quantity + ${back} where id = ${o.batch_id}`;
      await tx`insert into stock_batch_moves (movement_id, batch_id, quantity) values (${movementId}, ${o.batch_id}, ${back})`;
      left -= back;
    }
  }
  if (left > 0) {
    const [b] = await tx`
      insert into stock_batches (product_id, received_at, expires_at, initial, quantity, movement_id)
      select id, now(), now() + make_interval(days => shelf_life_days), ${left}, ${left}, ${movementId}
      from products where id = ${productId}
      returning id`;
    await tx`insert into stock_batch_moves (movement_id, batch_id, quantity) values (${movementId}, ${b.id}, ${left})`;
  }
}

// Lotes com saldo, do que vence antes para o que vence depois.
export async function productBatches(productId: number) {
  return db()`
    select id, received_at as "receivedAt", expires_at as "expiresAt", initial, quantity
    from stock_batches where product_id = ${productId} and quantity > 0
    order by expires_at nulls last, received_at, id`;
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
    // Só o que está dentro da validade cobre pedido.
    db()`select product_id as id, on_hand - expired as stock_units from product_stock` as Promise<{ id: number; stock_units: number }[]>,
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
export type ExpiryStatus = "vencido" | "vencendo" | null;

// Produtos com lote vencendo dentro deste prazo aparecem em "Precisa de atenção".
export const EXPIRY_WARNING_DAYS = 10;

type InventoryRow = {
  id: number; sku: string; name: string; slug: string; imageUrl: string | null; unitLabel: string; boxSize: number;
  minStockUnits: number; active: boolean; producerName: string; onHand: number; reserved: number; available: number;
  lastMovementAt: Date | null; shelfLifeDays: number | null; nextExpiry: Date | null; expiredUnits: number; expiringUnits: number;
};

export async function inventoryOverview() {
  const [rows, coverage] = await Promise.all([
    db()`
      select p.id, p.sku, p.name, p.slug, p.image_url as "imageUrl", p.unit_label as "unitLabel", p.box_size as "boxSize",
             p.min_stock_units as "minStockUnits", p.active, pr.name as "producerName",
             ps.on_hand as "onHand", ps.reserved, ps.available,
             (select max(created_at) from stock_movements m where m.product_id = p.id) as "lastMovementAt",
             p.shelf_life_days as "shelfLifeDays", b.next_expiry as "nextExpiry",
             coalesce(b.expired, 0)::int as "expiredUnits", coalesce(b.expiring, 0)::int as "expiringUnits"
      from products p
      left join lateral (
        select min(expires_at) as next_expiry,
               sum(quantity) filter (where expires_at <= now()) as expired,
               sum(quantity) filter (where expires_at > now() and expires_at <= now() + make_interval(days => ${EXPIRY_WARNING_DAYS})) as expiring
        from stock_batches sb where sb.product_id = p.id and sb.quantity > 0
      ) b on true join producers pr on pr.id = p.producer_id join product_stock ps on ps.product_id = p.id
      order by p.name` as Promise<InventoryRow[]>,
    openOrdersCoverage(),
  ]);

  const products = rows.map((r) => {
    const shortUnits = coverage.shortByProduct.get(r.id) ?? 0;
    const status: StockStatus = shortUnits > 0 ? "falta" : r.available <= 0 ? "zerado" : r.available < r.minStockUnits ? "baixo" : "ok";
    const expiry: ExpiryStatus = r.expiredUnits > 0 ? "vencido" : r.expiringUnits > 0 ? "vencendo" : null;
    return { ...r, shortUnits, openOrders: coverage.openByProduct.get(r.id)?.size ?? 0, status, expiry };
  });
  // Primeiro o que precisa de ação: falta para pedidos, validade, saldo zerado, abaixo do mínimo.
  const rank = (p: (typeof products)[number]) =>
    p.status === "falta" ? 0 : p.expiry === "vencido" ? 1 : p.expiry === "vencendo" ? 2 : p.status === "zerado" ? 3 : p.status === "baixo" ? 4 : 5;
  products.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return {
    products,
    summary: {
      skus: products.length,
      withShortage: products.filter((p) => p.status === "falta").length,
      belowMinimum: products.filter((p) => p.status === "baixo" || p.status === "zerado").length,
      expiring: products.filter((p) => p.expiry).length,
      expiredUnits: products.reduce((acc, p) => acc + p.expiredUnits, 0),
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
              o.delivery_changed_at as "deliveryChangedAt",
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
        (select min(scheduled_delivery)::text from orders where status in ('pending', 'confirmed', 'preparing')) as "nextRoute",
        -- Total de vendas: todo pedido que não foi cancelado (float8 para não estourar int em somas grandes).
        (select coalesce(sum(total_cents), 0)::float8 from orders where status <> 'cancelled') as "salesCents",
        (select count(*)::int from orders where status <> 'cancelled') as "salesOrders",
        (select coalesce(sum(total_cents), 0)::float8 from orders where status <> 'cancelled' and created_at > now() - interval '30 days') as "sales30dCents"`,
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
