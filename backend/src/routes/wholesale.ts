import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { currentUser, optionalAuth, requireAuth, requireRole } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { addressSchema, cepSchema } from "../lib/schemas";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { createOrder, priceItems } from "../repos/checkout";
import { findProduct, listProducts } from "../repos/products";

// Linha do "Pedido Rápido": por id ou SKU, quantidade em caixas.
const quickItemSchema = z
  .object({
    productId: z.number().int().positive().optional(),
    sku: z.string().trim().optional(),
    boxes: z.number().int().min(1).max(9999),
  })
  .refine((i) => i.productId || i.sku, { message: "Informe productId ou sku" });

const quickOrderSchema = z.object({ items: z.array(quickItemSchema).min(1).max(100) });

async function resolveItems(items: z.infer<typeof quickItemSchema>[]) {
  return Promise.all(
    items.map(async (i) => {
      if (i.productId) return { productId: i.productId, mode: "box" as const, quantity: i.boxes };
      const product = await findProduct({ sku: i.sku! });
      if (!product) throw badRequest(`SKU ${i.sku} não encontrado`);
      return { productId: product.id, mode: "box" as const, quantity: i.boxes };
    }),
  );
}

async function quickOrderView(items: z.infer<typeof quickItemSchema>[]) {
  const priced = await priceItems(await resolveItems(items));
  return {
    lines: priced.lines.map((l) => ({
      product: l.product,
      boxes: l.quantity,
      units: l.units,
      appliedTier: l.tier,
      unitPriceCents: l.unitPriceCents,
      subtotalCents: l.totalCents,
      savingsCents: l.savingsCents,
      availableBoxes: Math.floor(l.availableUnits / (l.units / l.quantity)),
      issue: l.issue,
    })),
    // "Total estimado • 24 caixas" e "Você economiza R$ X nesta faixa"
    totals: { boxes: priced.totals.boxes, totalCents: priced.totals.subtotalCents, savingsCents: priced.totals.savingsCents },
    hasIssues: priced.hasIssues,
  };
}

export const wholesaleRoutes = new Hono<AppEnv>()
  // Tabela do Pedido Rápido: produtos com faixas por caixa e estoque em caixas.
  .get("/catalog", optionalAuth, async (c) => {
    const user = c.get("user");
    const [account] = user
      ? await db()`
          select trade_name as "tradeName", price_table as "priceTable", price_table_valid_until::text as "validUntil",
                 account_manager as "accountManager"
          from business_accounts where user_id = ${user.id}`
      : [];
    const products = await listProducts({ inStock: true, sort: "best_sellers", pageSize: 60 });
    return c.json({
      account: account ?? null,
      products: products.items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: `${p.name} • ${p.weightGrams} g`,
        packaging: `${p.wholesale.boxSize} ${p.retail.unitLabel}s`,
        tiers: p.wholesale.tiers,
        availableBoxes: p.stock.boxes,
      })),
    });
  })

  // Simula preço por faixa em tempo real (público, para quem ainda está avaliando).
  .post("/quick-order/price", validate("json", quickOrderSchema), async (c) => {
    return c.json(await quickOrderView(c.req.valid("json").items));
  })

  .use(requireAuth, requireRole("business"))

  // Fecha o pedido direto (sem cotação).
  .post(
    "/quick-order/checkout",
    validate("json", quickOrderSchema.extend({ cep: cepSchema, address: addressSchema, notes: z.string().max(500).optional() })),
    async (c) => {
      const body = c.req.valid("json");
      const order = await createOrder({
        user: currentUser(c),
        items: await resolveItems(body.items),
        cep: body.cep,
        address: body.address,
        notes: body.notes,
      });
      return c.json({ order }, 201);
    },
  )

  // "Pedir Cotação para Grande Volume"
  .post("/quotes", validate("json", quickOrderSchema.extend({ notes: z.string().max(1000).optional() })), async (c) => {
    const user = currentUser(c);
    const body = c.req.valid("json");
    const view = await quickOrderView(body.items);
    const items = view.lines.map((l) => ({
      productId: l.product.id,
      sku: l.product.sku,
      name: l.product.name,
      boxes: l.boxes,
      unitPriceCents: l.unitPriceCents,
      subtotalCents: l.subtotalCents,
    }));
    const [quote] = await db()`
      insert into quote_requests (user_id, items, estimated_total_cents, savings_cents, notes)
      values (${user.id}, ${JSON.stringify(items)}::jsonb, ${view.totals.totalCents}, ${view.totals.savingsCents},
              ${body.notes ?? null})
      returning code, status, estimated_total_cents as "estimatedTotalCents", savings_cents as "savingsCents",
                created_at as "createdAt"`;
    return c.json({ quote: { ...quote, items } }, 201);
  })

  .get("/quotes", async (c) => {
    const quotes = await db()`
      select code, status, estimated_total_cents as "estimatedTotalCents", offered_total_cents as "offeredTotalCents",
             valid_until::text as "validUntil", created_at as "createdAt"
      from quote_requests where user_id = ${currentUser(c).id} order by created_at desc`;
    return c.json({ quotes });
  })

  .get("/quotes/:code", async (c) => {
    const [quote] = await db()`
      select code, status, items, estimated_total_cents as "estimatedTotalCents", savings_cents as "savingsCents",
             notes, response_message as "responseMessage", offered_total_cents as "offeredTotalCents",
             valid_until::text as "validUntil", created_at as "createdAt"
      from quote_requests where code = ${c.req.param("code")} and user_id = ${currentUser(c).id}`;
    if (!quote) throw notFound("Cotação");
    return c.json({ quote });
  })

  .post("/quotes/:code/:decision{accept|decline}", async (c) => {
    const status = c.req.param("decision") === "accept" ? "accepted" : "declined";
    const [quote] = await db()`
      update quote_requests set status = ${status}, updated_at = now()
      where code = ${c.req.param("code")} and user_id = ${currentUser(c).id} and status = 'answered'
        and (valid_until is null or valid_until >= current_date)
      returning code, status`;
    if (!quote) throw conflict("Só é possível responder cotações já respondidas pela equipe e dentro da validade");
    return c.json({ quote });
  });
