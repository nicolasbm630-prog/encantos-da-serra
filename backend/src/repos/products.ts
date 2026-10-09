import { db } from "../db";
import { maxWholesaleDiscountPct, sortTiers, type PriceTier } from "../lib/pricing";
import { Conditions, pgIntArray } from "../lib/query";
import { normalize } from "../lib/text";

export const PRODUCT_COLUMNS = `
  p.id, p.slug, p.sku, p.name, p.description, p.unit_label, p.weight_grams, p.retail_price_cents,
  p.box_size, p.milk_type, p.detail_tag, p.cure_days, p.badge, p.awarded, p.image_url,
  ps.available as stock_units, p.featured, p.active, p.sales_count, p.created_at,
  json_build_object('id', pr.id, 'slug', pr.slug, 'name', pr.name, 'city', pr.city, 'state', pr.state) as producer,
  json_build_object('id', c.id, 'slug', c.slug, 'name', c.name) as category,
  coalesce((
    select json_agg(json_build_object('minBoxes', t.min_boxes, 'maxBoxes', t.max_boxes, 'unitPriceCents', t.unit_price_cents) order by t.min_boxes)
    from price_tiers t where t.product_id = p.id
  ), '[]'::json) as tiers`;

// stock_units aqui é o DISPONÍVEL para venda (físico − reservado em pedidos abertos), via view product_stock.
export const PRODUCT_FROM = `from products p join producers pr on pr.id = p.producer_id join categories c on c.id = p.category_id
  join product_stock ps on ps.product_id = p.id`;

export type ProductRow = {
  id: number;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  unit_label: string;
  weight_grams: number;
  retail_price_cents: number;
  box_size: number;
  milk_type: string;
  detail_tag: string | null;
  cure_days: number | null;
  badge: string | null;
  awarded: boolean;
  image_url: string | null;
  stock_units: number;
  featured: boolean;
  active: boolean;
  sales_count: number;
  created_at: Date;
  producer: { id: number; slug: string; name: string; city: string; state: string };
  category: { id: number; slug: string; name: string };
  tiers: PriceTier[] | string;
};

function parseTiers(tiers: ProductRow["tiers"]): PriceTier[] {
  return sortTiers(typeof tiers === "string" ? JSON.parse(tiers) : tiers);
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export function toProductDto(row: ProductRow) {
  const tiers = parseTiers(row.tiers);
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    badge: row.badge,
    awarded: row.awarded,
    detailTag: row.detail_tag,
    milkType: row.milk_type,
    cureDays: row.cure_days,
    weightGrams: row.weight_grams,
    featured: row.featured,
    producer: parseJson(row.producer),
    category: parseJson(row.category),
    retail: {
      priceCents: row.retail_price_cents,
      unitLabel: row.unit_label,
      // "por peça 600 g"
      priceLabel: `por ${row.unit_label} ${row.weight_grams} g`,
    },
    wholesale: {
      boxSize: row.box_size,
      boxLabel: `Caixa c/ ${row.box_size}`,
      fromUnitPriceCents: tiers[0]?.unitPriceCents ?? null,
      maxDiscountPct: maxWholesaleDiscountPct(row.retail_price_cents, tiers),
      tiers,
    },
    stock: {
      units: Math.max(0, row.stock_units),
      boxes: Math.max(0, Math.floor(row.stock_units / row.box_size)),
      available: row.stock_units > 0,
    },
  };
}

export type ProductDto = ReturnType<typeof toProductDto>;

export const productSorts = ["featured", "best_sellers", "price_asc", "price_desc", "newest", "name"] as const;

const ORDER_BY: Record<(typeof productSorts)[number], string> = {
  featured: "p.featured desc, p.sales_count desc, p.id",
  best_sellers: "p.sales_count desc, p.id",
  price_asc: "p.retail_price_cents asc, p.id",
  price_desc: "p.retail_price_cents desc, p.id",
  newest: "p.created_at desc, p.id desc",
  name: "p.name asc",
};

export type ProductFilters = {
  q?: string;
  category?: string;
  producer?: string;
  milk?: string;
  cureMin?: number;
  cureMax?: number;
  awarded?: boolean;
  maxWeight?: number;
  minWeight?: number;
  featured?: boolean;
  inStock?: boolean;
  sort?: (typeof productSorts)[number];
  page?: number;
  pageSize?: number;
};

export async function listProducts(f: ProductFilters) {
  const where = new Conditions().raw("p.active");
  if (f.q) where.add((p) => `(p.search_text like ${p()} or pr.search_text like ${p()})`, ...Array(2).fill(`%${normalize(f.q)}%`));
  if (f.category) where.add((p) => `c.slug = ${p()}`, f.category);
  if (f.producer) where.add((p) => `pr.slug = ${p()}`, f.producer);
  if (f.milk) where.add((p) => `p.milk_type = ${p()}`, f.milk);
  if (f.cureMin !== undefined) where.add((p) => `p.cure_days >= ${p()}`, f.cureMin);
  if (f.cureMax !== undefined) where.add((p) => `p.cure_days <= ${p()}`, f.cureMax);
  if (f.awarded) where.raw("p.awarded");
  if (f.maxWeight !== undefined) where.add((p) => `p.weight_grams <= ${p()}`, f.maxWeight);
  if (f.minWeight !== undefined) where.add((p) => `p.weight_grams >= ${p()}`, f.minWeight);
  if (f.featured) where.raw("p.featured");
  if (f.inStock) where.raw("ps.available > 0");

  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 12;
  const orderBy = ORDER_BY[f.sort ?? "featured"];
  const limit = where.param(pageSize);
  const offset = where.param((page - 1) * pageSize);

  const rows: (ProductRow & { total: number })[] = await db().unsafe(
    `select ${PRODUCT_COLUMNS}, count(*) over ()::int as total ${PRODUCT_FROM} ${where.where()}
     order by ${orderBy} limit ${limit} offset ${offset}`,
    where.params,
  );
  const total = rows[0]?.total ?? 0;
  return {
    items: rows.map(toProductDto),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function findProduct(by: { id?: number; slug?: string; sku?: string }) {
  const where = new Conditions();
  if (by.id !== undefined) where.add((p) => `p.id = ${p()}`, by.id);
  else if (by.slug) where.add((p) => `p.slug = ${p()}`, by.slug);
  else if (by.sku) where.add((p) => `p.sku = ${p()}`, by.sku);
  else return undefined;
  const rows: ProductRow[] = await db().unsafe(`select ${PRODUCT_COLUMNS} ${PRODUCT_FROM} ${where.where()}`, where.params);
  return rows[0] ? toProductDto(rows[0]) : undefined;
}

export async function findProductsByIds(ids: number[]) {
  if (ids.length === 0) return new Map<number, ProductDto>();
  const rows: ProductRow[] = await db().unsafe(
    `select ${PRODUCT_COLUMNS} ${PRODUCT_FROM} where p.id = any($1::int[])`,
    [pgIntArray(ids)],
  );
  return new Map(rows.map((r) => [r.id, toProductDto(r)]));
}

export function productSearchText(p: { name: string; sku: string; description?: string | null; badge?: string | null; detailTag?: string | null }) {
  return normalize([p.name, p.sku, p.description, p.badge, p.detailTag].filter(Boolean).join(" "));
}
