import { Hono } from "hono";
import { db } from "../db";
import { currentUser, requireAuth } from "../lib/auth";
import { notFound } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { findProductsByIds } from "../repos/products";

// Favoritos (ícone de coração nos cards).
export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/favorites", async (c) => {
    const rows = await db()`
      select product_id from favorites where user_id = ${currentUser(c).id} order by created_at desc`;
    const ids = rows.map((r: { product_id: number }) => r.product_id);
    const products = await findProductsByIds(ids);
    return c.json({ items: ids.map((id: number) => products.get(id)).filter(Boolean) });
  })
  .put("/favorites/:productId", async (c) => {
    const productId = Number(c.req.param("productId"));
    const [product] = await db()`select id from products where id = ${productId}`;
    if (!product) throw notFound("Produto");
    await db()`
      insert into favorites (user_id, product_id) values (${currentUser(c).id}, ${productId}) on conflict do nothing`;
    return c.json({ productId, favorite: true });
  })
  .delete("/favorites/:productId", async (c) => {
    const productId = Number(c.req.param("productId"));
    await db()`delete from favorites where user_id = ${currentUser(c).id} and product_id = ${productId}`;
    return c.json({ productId, favorite: false });
  });
