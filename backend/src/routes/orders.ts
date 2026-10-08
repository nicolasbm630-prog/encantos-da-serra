import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { currentUser, requireAuth } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { addressSchema, cepSchema } from "../lib/schemas";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { createOrder, getOrder } from "../repos/checkout";
import { cartItems } from "./cart";

const checkoutSchema = z.object({
  cartToken: z.string().min(10),
  cep: cepSchema,
  address: addressSchema,
  notes: z.string().max(500).optional(),
});

const trackSchema = z.object({ code: z.string().trim().min(5), email: z.email() });

export const orderRoutes = new Hono<AppEnv>()
  // "Rastrear pedido" — público, com código + e-mail de quem comprou.
  .get("/track", validate("query", trackSchema), async (c) => {
    const { code, email } = c.req.valid("query");
    const [row] = await db()`
      select o.id from orders o join users u on u.id = o.user_id
      where o.code = ${code.toUpperCase()} and u.email = ${email.toLowerCase()}`;
    if (!row) throw notFound("Pedido");
    const { address, userId, notes, ...order } = await getOrder(row.id);
    return c.json({ order });
  })

  .use(requireAuth)

  .post("/", validate("json", checkoutSchema), async (c) => {
    const user = currentUser(c);
    const body = c.req.valid("json");
    const [cart] = await db()`select id, user_id from carts where token = ${body.cartToken}`;
    if (!cart) throw notFound("Carrinho");
    if (cart.user_id && cart.user_id !== user.id) throw forbidden("Este carrinho pertence a outra conta");

    const items = await cartItems(cart.id);
    if (items.length === 0) throw badRequest("Carrinho vazio");

    const order = await createOrder({
      user,
      items,
      cep: body.cep,
      address: body.address,
      notes: body.notes,
      afterCreate: async (tx) => {
        await tx`delete from cart_items where cart_id = ${cart.id}`;
      },
    });
    return c.json({ order }, 201);
  })

  .get("/", async (c) => {
    const user = currentUser(c);
    const orders = await db()`
      select code, channel, status, total_cents as "totalCents", scheduled_delivery::text as "scheduledDelivery",
             created_at as "createdAt",
             (select count(*)::int from order_items i where i.order_id = o.id) as "itemCount"
      from orders o where user_id = ${user.id} order by created_at desc limit 50`;
    return c.json({ orders });
  })

  .get("/:code", async (c) => {
    const user = currentUser(c);
    const [row] = await db()`select id, user_id from orders where code = ${c.req.param("code").toUpperCase()}`;
    if (!row || (row.user_id !== user.id && user.role !== "admin")) throw notFound("Pedido");
    return c.json({ order: await getOrder(row.id) });
  });
