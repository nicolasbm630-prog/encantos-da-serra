import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { notFound } from "../lib/errors";
import { normalize } from "../lib/text";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { findProduct, listProducts, productSorts } from "../repos/products";

const boolParam = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  producer: z.string().optional(),
  milk: z.enum(["vaca", "cabra", "bufala", "misto", "nenhum"]).optional(),
  cureMin: z.coerce.number().int().min(0).optional(),
  cureMax: z.coerce.number().int().min(0).optional(),
  awarded: boolParam,
  maxWeight: z.coerce.number().int().positive().optional(),
  minWeight: z.coerce.number().int().positive().optional(),
  featured: boolParam,
  inStock: boolParam,
  sort: z.enum(productSorts).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});

// Chips de filtro exibidos em "Destaques & Mais Pedidos".
const QUICK_FILTERS = [
  { id: "todos", label: "Todos", params: {} },
  { id: "leite-de-vaca", label: "Leite de vaca", params: { milk: "vaca" } },
  { id: "leite-de-cabra", label: "Leite de cabra", params: { milk: "cabra" } },
  { id: "cura-15-30", label: "Cura 15–30 dias", params: { cureMin: 15, cureMax: 30 } },
  { id: "cura-60", label: "Cura +60 dias", params: { cureMin: 60 } },
  { id: "premiados", label: "Premiados", params: { awarded: true } },
  { id: "ate-500g", label: "Até 500 g", params: { maxWeight: 500 } },
  { id: "1kg-ou-mais", label: "1 kg ou mais", params: { minWeight: 1000 } },
];

export const catalogRoutes = new Hono<AppEnv>()
  .get("/categories", async (c) => {
    const categories = await db()`
      select c.id, c.slug, c.name, c.description, c.icon,
        (select count(*)::int from products p where p.category_id = c.id and p.active) as "productCount"
      from categories c order by c.sort_order, c.name`;
    return c.json({ categories });
  })

  .get("/products/filters", (c) => c.json({ quickFilters: QUICK_FILTERS, sorts: productSorts }))

  .get("/products", validate("query", listQuery), async (c) => {
    return c.json(await listProducts(c.req.valid("query")));
  })

  .get("/products/:slug", async (c) => {
    const product = await findProduct({ slug: c.req.param("slug") });
    if (!product) throw notFound("Produto");

    const [lot] = await db()`
      select code, title, produced_on::text as "producedOn", cure_days as "cureDays", notes
      from lots where product_id = ${product.id} order by produced_on desc limit 1`;
    const related = await listProducts({ category: product.category.slug, pageSize: 5 });

    return c.json({
      product,
      currentLot: lot ?? null,
      related: related.items.filter((p) => p.id !== product.id).slice(0, 4),
    });
  })

  .get("/producers", async (c) => {
    const producers = await db()`
      select pr.id, pr.slug, pr.name, pr.owner_name as "ownerName", pr.city, pr.state, pr.image_url as "imageUrl",
        pr.partner_since::text as "partnerSince", pr.certifications,
        (select count(*)::int from products p where p.producer_id = pr.id and p.active) as "productCount"
      from producers pr order by pr.name`;
    return c.json({ producers });
  })

  .get("/producers/:slug", async (c) => {
    const [producer] = await db()`
      select id, slug, name, owner_name as "ownerName", city, state, story, image_url as "imageUrl",
        partner_since::text as "partnerSince", certifications
      from producers where slug = ${c.req.param("slug")}`;
    if (!producer) throw notFound("Produtor");
    const products = await listProducts({ producer: producer.slug, pageSize: 60 });
    return c.json({ producer, products: products.items });
  })

  // Rastreabilidade: origem, data de produção e cura do lote.
  .get("/lots/:code", async (c) => {
    const [lot] = await db()`
      select l.code, l.title, l.produced_on::text as "producedOn", l.cure_days as "cureDays", l.notes, l.image_url as "imageUrl",
        json_build_object('slug', p.slug, 'name', p.name, 'sku', p.sku) as product,
        json_build_object('slug', pr.slug, 'name', pr.name, 'city', pr.city, 'state', pr.state,
                          'certifications', pr.certifications) as producer
      from lots l join products p on p.id = l.product_id join producers pr on pr.id = p.producer_id
      where l.code = ${c.req.param("code")}`;
    if (!lot) throw notFound("Lote");
    return c.json({ lot });
  })

  // Sugestões da busca do cabeçalho ("Busque queijo, produtor ou selo…").
  .get("/search/suggest", validate("query", z.object({ q: z.string().trim().min(2) })), async (c) => {
    const term = `%${normalize(c.req.valid("query").q)}%`;
    const [products, producers, categories] = await Promise.all([
      db()`
        select p.slug, p.name, p.image_url as "imageUrl", pr.name as "producerName", p.retail_price_cents as "priceCents"
        from products p join producers pr on pr.id = p.producer_id
        where p.active and (p.search_text like ${term} or pr.search_text like ${term})
        order by p.sales_count desc limit 5`,
      db()`
        select slug, name, city, state from producers where search_text like ${term} order by name limit 3`,
      db()`select slug, name from categories where lower(name) like ${term} or slug like ${term} limit 3`,
    ]);
    return c.json({ products, producers, categories });
  });
