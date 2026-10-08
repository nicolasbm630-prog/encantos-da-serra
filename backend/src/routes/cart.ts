import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { optionalAuth } from "../lib/auth";
import { notFound } from "../lib/errors";
import { randomToken } from "../lib/text";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { priceItems, type ItemInput } from "../repos/checkout";

async function cartId(token: string): Promise<number> {
  const [cart] = await db()`select id from carts where token = ${token}`;
  if (!cart) throw notFound("Carrinho");
  return cart.id;
}

export async function cartItems(id: number): Promise<(ItemInput & { id: number })[]> {
  return db()`select id, product_id as "productId", mode, quantity from cart_items where cart_id = ${id} order by id`;
}

async function cartView(token: string, knownId?: number) {
  const id = knownId ?? (await cartId(token));
  const items = await cartItems(id);
  const priced = await priceItems(items);
  return {
    token,
    // id do item no carrinho, para editar/remover
    lines: priced.lines.map((line, i) => ({ itemId: items[i]!.id, ...line })),
    totals: priced.totals,
    hasIssues: priced.hasIssues,
  };
}

const putItemSchema = z.object({
  productId: z.number().int().positive(),
  mode: z.enum(["unit", "box"]).default("unit"),
  // 0 remove o item
  quantity: z.number().int().min(0).max(999),
});

export const cartRoutes = new Hono<AppEnv>()
  // Cria carrinho (visitante ou logado). Guarde o token no front (cookie/localStorage).
  .post("/", optionalAuth, async (c) => {
    const token = randomToken();
    await db()`insert into carts (token, user_id) values (${token}, ${c.get("user")?.id ?? null})`;
    return c.json({ token, lines: [], totals: { units: 0, boxes: 0, subtotalCents: 0, savingsCents: 0 } }, 201);
  })

  .get("/:token", async (c) => c.json(await cartView(c.req.param("token"))))

  // Define a quantidade de um produto (varejo = unidade, atacado = caixa).
  .put("/:token/items", validate("json", putItemSchema), async (c) => {
    const token = c.req.param("token");
    const { productId, mode, quantity } = c.req.valid("json");
    // Uma ida ao banco para achar o carrinho e marcar a atualização (o banco fica longe: cada consulta conta).
    const [cart] = await db()`update carts set updated_at = now() where token = ${token} returning id`;
    if (!cart) throw notFound("Carrinho");

    if (quantity === 0) {
      await db()`delete from cart_items where cart_id = ${cart.id} and product_id = ${productId} and mode = ${mode}`;
    } else {
      // Só insere se o produto existe e está ativo.
      const inserted = await db()`
        insert into cart_items (cart_id, product_id, mode, quantity)
        select ${cart.id}, id, ${mode}, ${quantity} from products where id = ${productId} and active
        on conflict (cart_id, product_id, mode) do update set quantity = excluded.quantity
        returning id`;
      if (inserted.length === 0) throw notFound("Produto");
    }
    return c.json(await cartView(token, cart.id));
  })

  .delete("/:token/items/:itemId", async (c) => {
    const token = c.req.param("token");
    const id = await cartId(token);
    await db()`delete from cart_items where cart_id = ${id} and id = ${Number(c.req.param("itemId"))}`;
    return c.json(await cartView(token));
  })

  .delete("/:token", async (c) => {
    const id = await cartId(c.req.param("token"));
    await db()`delete from cart_items where cart_id = ${id}`;
    return c.body(null, 204);
  });
