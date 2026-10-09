import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { config } from "../config";
import { adminAccess, currentUser } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { slugify } from "../lib/text";
import type { AppEnv } from "../lib/types";
import { uploadPath } from "../lib/uploads";
import { isUniqueViolation, validate } from "../lib/validate";
import { findProduct, productSearchText } from "../repos/products";
import { getOrder } from "../repos/checkout";
import { applyMovement, inventoryOverview, ORDER_FILTERS, ordersBoard, productMovements, transitionOrder } from "../repos/inventory";

const tierSchema = z.object({
  minBoxes: z.number().int().min(1),
  maxBoxes: z.number().int().min(1).nullable(),
  unitPriceCents: z.number().int().positive(),
});

const productSchema = z.object({
  name: z.string().trim().min(2),
  sku: z.string().trim().min(3).transform((s) => s.toUpperCase()),
  slug: z.string().trim().optional(),
  description: z.string().optional(),
  producerId: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  unitLabel: z.string().trim().min(2),
  weightGrams: z.number().int().positive(),
  retailPriceCents: z.number().int().positive(),
  boxSize: z.number().int().positive(),
  milkType: z.enum(["vaca", "cabra", "bufala", "misto", "nenhum"]),
  detailTag: z.string().optional(),
  cureDays: z.number().int().min(0).optional(),
  badge: z.string().optional(),
  awarded: z.boolean().default(false),
  imageUrl: z.url().optional(),
  stockUnits: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  tiers: z.array(tierSchema).min(1),
});

const movementSchema = z.object({
  kind: z.enum(["entrada", "saida", "perda", "contagem"]),
  quantity: z.number().int().min(0).max(1_000_000),
  unit: z.enum(["unit", "box"]).default("unit"),
  note: z.string().trim().max(300).optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(["confirmed", "preparing", "in_transit", "delivered", "cancelled"]),
  message: z.string().trim().min(3).max(300),
  temperatureC: z.number().min(-10).max(30).optional(),
  // Expede mesmo sem cobertura completa (passa na frente de pedidos mais antigos).
  force: z.boolean().optional(),
});

async function replaceTiers(tx: any, productId: number, tiers: z.infer<typeof tierSchema>[]) {
  await tx`delete from price_tiers where product_id = ${productId}`;
  for (const t of tiers) {
    await tx`
      insert into price_tiers (product_id, min_boxes, max_boxes, unit_price_cents)
      values (${productId}, ${t.minBoxes}, ${t.maxBoxes}, ${t.unitPriceCents})`;
  }
}

export const adminRoutes = new Hono<AppEnv>()
  // Público: o painel pergunta se precisa de login.
  .get("/access", (c) => c.json({ open: config().ADMIN_AUTH_DISABLED }))
  .use(adminAccess)

  .get("/dashboard", async (c) => {
    const [summary] = await db()`
      select
        (select count(*)::int from orders where status not in ('delivered', 'cancelled')) as "openOrders",
        (select coalesce(sum(total_cents), 0)::int from orders where created_at > now() - interval '30 days'
           and status <> 'cancelled') as "revenueLast30DaysCents",
        (select count(*)::int from quote_requests where status = 'open') as "openQuotes",
        (select count(*)::int from supplier_proposals where status in ('submitted', 'in_review')) as "proposalsToReview",
        (select count(*)::int from contact_messages where not handled) as "unreadMessages",
        (select count(*)::int from products p join product_stock ps on ps.product_id = p.id
           where p.active and ps.available < p.min_stock_units) as "lowStockProducts"`;
    return c.json({ summary });
  })

  // Produtos
  .post("/products", validate("json", productSchema), async (c) => {
    const b = c.req.valid("json");
    try {
      const id = await db().begin(async (tx) => {
        const [row] = await tx`
          insert into products (slug, sku, name, description, producer_id, category_id, unit_label, weight_grams,
            retail_price_cents, box_size, milk_type, detail_tag, cure_days, badge, awarded, image_url, stock_units,
            featured, active, search_text)
          values (${b.slug ?? slugify(b.name)}, ${b.sku}, ${b.name}, ${b.description ?? null}, ${b.producerId},
            ${b.categoryId}, ${b.unitLabel}, ${b.weightGrams}, ${b.retailPriceCents}, ${b.boxSize}, ${b.milkType},
            ${b.detailTag ?? null}, ${b.cureDays ?? null}, ${b.badge ?? null}, ${b.awarded}, ${b.imageUrl ?? null},
            0, ${b.featured}, ${b.active}, ${productSearchText(b)})
          returning id`;
        await replaceTiers(tx, row.id, b.tiers);
        if (b.stockUnits > 0) {
          await applyMovement(tx, { productId: row.id, kind: "entrada", delta: b.stockUnits, note: "Estoque inicial", userId: currentUser(c).id });
        }
        return row.id as number;
      });
      return c.json({ product: await findProduct({ id }) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("SKU ou slug já existe");
      throw error;
    }
  })

  .patch(
    "/products/:id",
    validate("json", productSchema.pick({ retailPriceCents: true, featured: true, active: true, badge: true, imageUrl: true, tiers: true }).partial()),
    async (c) => {
      const id = Number(c.req.param("id"));
      const b = c.req.valid("json");
      await db().begin(async (tx) => {
        const [row] = await tx`
          update products set
            retail_price_cents = coalesce(${b.retailPriceCents ?? null}, retail_price_cents),
            featured = coalesce(${b.featured ?? null}, featured),
            active = coalesce(${b.active ?? null}, active),
            badge = coalesce(${b.badge ?? null}, badge),
            image_url = coalesce(${b.imageUrl ?? null}, image_url),
            updated_at = now()
          where id = ${id} returning id`;
        if (!row) throw notFound("Produto");
        if (b.tiers) await replaceTiers(tx, id, b.tiers);
      });
      return c.json({ product: await findProduct({ id }) });
    },
  )

  // Pedidos com cobertura de estoque e avanço de status.
  .get("/orders", validate("query", z.object({ filter: z.enum(ORDER_FILTERS).default("open"), q: z.string().optional() })), async (c) => {
    const { filter, q } = c.req.valid("query");
    return c.json(await ordersBoard(filter, q));
  })

  .post("/orders/:code/events", validate("json", orderStatusSchema), async (c) => {
    const b = c.req.valid("json");
    const orderId = await transitionOrder(c.req.param("code"), b.status, {
      message: b.message,
      temperatureC: b.temperatureC,
      userId: currentUser(c).id,
      force: b.force,
    });
    return c.json({ order: await getOrder(orderId) });
  })

  // Estoque: físico x reservado x disponível, com cobertura dos pedidos abertos.
  .get("/inventory", async (c) => c.json(await inventoryOverview()))

  .get("/inventory/:productId/movements", async (c) => {
    return c.json({ movements: await productMovements(Number(c.req.param("productId"))) });
  })

  .post("/inventory/:productId/movements", validate("json", movementSchema), async (c) => {
    const productId = Number(c.req.param("productId"));
    const b = c.req.valid("json");
    const stockAfter = await db().begin(async (tx) => {
      const [p] = await tx`select stock_units, box_size from products where id = ${productId} for update`;
      if (!p) throw notFound("Produto");
      const units = b.unit === "box" ? b.quantity * p.box_size : b.quantity;
      // Contagem informa o total físico encontrado; os demais tipos informam a quantidade movimentada.
      const delta = b.kind === "contagem" ? units - p.stock_units : b.kind === "entrada" ? units : -units;
      if (delta === 0 && b.kind !== "contagem") throw badRequest("Quantidade precisa ser maior que zero");
      return applyMovement(tx, { productId, kind: b.kind, delta, note: b.note, userId: currentUser(c).id });
    });
    return c.json({ stockAfter, ...(await inventoryOverview()) }, 201);
  })

  .patch("/inventory/:productId", validate("json", z.object({ minStockUnits: z.number().int().min(0).max(100_000) })), async (c) => {
    const [row] = await db()`
      update products set min_stock_units = ${c.req.valid("json").minStockUnits}, updated_at = now()
      where id = ${Number(c.req.param("productId"))} returning id`;
    if (!row) throw notFound("Produto");
    return c.json(await inventoryOverview());
  })

  // Cotações B2B
  .get("/quotes", async (c) => {
    const quotes = await db()`
      select q.code, q.status, q.items, q.estimated_total_cents as "estimatedTotalCents", q.notes,
             q.created_at as "createdAt", u.name as "buyerName", b.trade_name as "tradeName"
      from quote_requests q join users u on u.id = q.user_id left join business_accounts b on b.user_id = u.id
      order by q.created_at desc limit 100`;
    return c.json({ quotes });
  })

  .post(
    "/quotes/:code/answer",
    validate("json", z.object({ offeredTotalCents: z.number().int().positive(), message: z.string().min(3), validUntil: z.iso.date() })),
    async (c) => {
      const b = c.req.valid("json");
      const [quote] = await db()`
        update quote_requests set status = 'answered', offered_total_cents = ${b.offeredTotalCents},
          response_message = ${b.message}, valid_until = ${b.validUntil}, updated_at = now()
        where code = ${c.req.param("code")} and status = 'open'
        returning code, status`;
      if (!quote) throw conflict("Cotação não está aberta");
      return c.json({ quote });
    },
  )

  // Propostas de produtores
  .get("/proposals", async (c) => {
    const proposals = await db()`
      select protocol, status, responsible_name as "responsibleName", property_name as "propertyName", city, state,
             main_product_type as "mainProductType", monthly_volume_kg as "monthlyVolumeKg", certifications,
             submitted_at as "submittedAt"
      from supplier_proposals where status <> 'draft' order by submitted_at desc`;
    return c.json({ proposals });
  })

  .patch(
    "/proposals/:protocol",
    validate("json", z.object({ status: z.enum(["in_review", "approved", "rejected"]), reviewNotes: z.string().optional() })),
    async (c) => {
      const b = c.req.valid("json");
      const [proposal] = await db()`
        update supplier_proposals set status = ${b.status}, review_notes = ${b.reviewNotes ?? null}, updated_at = now()
        where protocol = ${c.req.param("protocol")} and status <> 'draft'
        returning protocol, status`;
      if (!proposal) throw notFound("Proposta");
      return c.json({ proposal });
    },
  )

  .get("/proposals/:protocol/attachments/:id", async (c) => {
    const [file] = await db()`
      select a.stored_name, a.original_name, a.mime_type, p.protocol
      from proposal_attachments a join supplier_proposals p on p.id = a.proposal_id
      where p.protocol = ${c.req.param("protocol")} and a.id = ${Number(c.req.param("id"))}`;
    if (!file) throw notFound("Anexo");
    return new Response(Bun.file(uploadPath(`proposals/${file.protocol}`, file.stored_name)), {
      headers: {
        "Content-Type": file.mime_type,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.original_name)}"`,
      },
    });
  })

  .get("/messages", async (c) => {
    const messages = await db()`select * from contact_messages order by created_at desc limit 100`;
    return c.json({ messages });
  });
