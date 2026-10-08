import type { SQL } from "bun";
import { db } from "../db";
import { shippingCents } from "../lib/delivery";
import { AppError, badRequest, forbidden } from "../lib/errors";
import { priceLine, sumLines, type PurchaseMode } from "../lib/pricing";
import type { AuthUser } from "../lib/types";
import { findProductsByIds, type ProductDto } from "./products";
import { describeRegion, regionForCep } from "./delivery";

export type ItemInput = { productId: number; mode: PurchaseMode; quantity: number };

export type PricedItem = ReturnType<typeof toPricedItem>;

function toPricedItem(product: ProductDto, item: ItemInput) {
  const line = priceLine({
    mode: item.mode,
    quantity: item.quantity,
    retailPriceCents: product.retail.priceCents,
    boxSize: product.wholesale.boxSize,
    tiers: product.wholesale.tiers,
  });
  const issue = !product.stock.available
    ? "out_of_stock"
    : line.units > product.stock.units
      ? "insufficient_stock"
      : null;
  return {
    product: {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      imageUrl: product.imageUrl,
      producerName: product.producer.name,
      unitLabel: product.retail.unitLabel,
      boxLabel: product.wholesale.boxLabel,
    },
    ...line,
    availableUnits: product.stock.units,
    issue,
  };
}

// Junta linhas repetidas (mesmo produto e modo) antes de precificar.
function mergeItems(items: ItemInput[]): ItemInput[] {
  const map = new Map<string, ItemInput>();
  for (const it of items) {
    const key = `${it.productId}:${it.mode}`;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it });
  }
  return [...map.values()];
}

export async function priceItems(items: ItemInput[]) {
  const merged = mergeItems(items);
  const products = await findProductsByIds([...new Set(merged.map((i) => i.productId))]);
  const lines = merged.map((item) => {
    const product = products.get(item.productId);
    if (!product) throw badRequest(`Produto ${item.productId} não existe`);
    return toPricedItem(product, item);
  });
  const totals = sumLines(lines);
  return {
    lines,
    totals: {
      units: lines.reduce((a, l) => a + l.units, 0),
      boxes: lines.filter((l) => l.mode === "box").reduce((a, l) => a + l.quantity, 0),
      subtotalCents: totals.totalCents,
      savingsCents: totals.savingsCents,
    },
    hasIssues: lines.some((l) => l.issue),
  };
}

export type Address = {
  recipient: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
};

// Cria o pedido numa transação: reserva estoque, define rota, registra o lote de cada item.
export async function createOrder(input: {
  user: AuthUser;
  items: ItemInput[];
  cep: string;
  address: Address;
  notes?: string;
  afterCreate?: (tx: SQL, orderId: number) => Promise<void>;
}) {
  const { user, items, cep, address, notes } = input;
  if (items.length === 0) throw badRequest("Nenhum item no pedido");

  const hasBoxes = items.some((i) => i.mode === "box");
  if (hasBoxes && user.role !== "business" && user.role !== "admin") {
    throw forbidden("Compras por caixa são exclusivas de contas B2B");
  }

  const priced = await priceItems(items);
  const issue = priced.lines.find((l) => l.issue);
  if (issue) throw new AppError(409, issue.issue!, `Estoque insuficiente para ${issue.product.name}`, priced.lines);

  const region = await regionForCep(cep);
  const delivery = describeRegion(region, 1);
  const shipping = shippingCents(region, priced.totals.subtotalCents);
  const channel = hasBoxes ? "wholesale" : "retail";

  const orderId = await db().begin(async (tx) => {
    // Baixa de estoque condicional: se outro pedido levou antes, a linha não é atualizada.
    for (const line of priced.lines) {
      const updated = await tx`
        update products set stock_units = stock_units - ${line.units}, sales_count = sales_count + ${line.units},
               updated_at = now()
        where id = ${line.product.id} and stock_units >= ${line.units} returning id`;
      if (updated.length === 0) {
        throw new AppError(409, "insufficient_stock", `Estoque insuficiente para ${line.product.name}`);
      }
    }

    const [order] = await tx`
      insert into orders (user_id, channel, subtotal_cents, discount_cents, shipping_cents, total_cents,
                          cep, address, delivery_region_id, scheduled_delivery, notes)
      values (${user.id}, ${channel}, ${priced.totals.subtotalCents}, 0, ${shipping},
              ${priced.totals.subtotalCents + shipping}, ${cep}, ${JSON.stringify(address)}::jsonb, ${region.id},
              ${delivery.nextDelivery?.date ?? null}, ${notes ?? null})
      returning id`;

    for (const line of priced.lines) {
      await tx`
        insert into order_items (order_id, product_id, lot_id, product_name, mode, quantity, units, unit_price_cents, total_cents)
        values (${order.id}, ${line.product.id},
                (select id from lots where product_id = ${line.product.id} order by produced_on desc limit 1),
                ${line.product.name}, ${line.mode}, ${line.quantity}, ${line.units}, ${line.unitPriceCents}, ${line.totalCents})`;
    }

    await tx`
      insert into order_events (order_id, status, message)
      values (${order.id}, 'pending', 'Pedido recebido. Aguardando confirmação do pagamento.')`;

    await input.afterCreate?.(tx, order.id);
    return order.id as number;
  });

  return getOrder(orderId);
}

export async function getOrder(orderId: number) {
  const [order] = await db()`
    select o.id, o.code, o.channel, o.status, o.subtotal_cents as "subtotalCents", o.discount_cents as "discountCents",
           o.shipping_cents as "shippingCents", o.total_cents as "totalCents", o.cep, o.address,
           o.scheduled_delivery::text as "scheduledDelivery", o.notes, o.created_at as "createdAt", o.user_id as "userId",
           dr.name as "deliveryRegion",
      coalesce((select json_agg(json_build_object(
          'productId', i.product_id, 'productName', i.product_name, 'mode', i.mode, 'quantity', i.quantity,
          'units', i.units, 'unitPriceCents', i.unit_price_cents, 'totalCents', i.total_cents,
          'lot', case when l.id is null then null else json_build_object(
            'code', l.code, 'producedOn', l.produced_on, 'cureDays', l.cure_days) end
        ) order by i.id)
        from order_items i left join lots l on l.id = i.lot_id where i.order_id = o.id), '[]'::json) as items,
      coalesce((select json_agg(json_build_object(
          'status', e.status, 'message', e.message, 'temperatureC', e.temperature_c, 'at', e.created_at
        ) order by e.created_at)
        from order_events e where e.order_id = o.id), '[]'::json) as timeline
    from orders o left join delivery_regions dr on dr.id = o.delivery_region_id
    where o.id = ${orderId}`;
  return order;
}
