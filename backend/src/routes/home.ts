import { Hono } from "hono";
import { config } from "../config";
import { db } from "../db";
import { todayIn, upcomingRoutes, weekdayName } from "../lib/delivery";
import type { AppEnv } from "../lib/types";
import { listProducts } from "../repos/products";

async function settings(): Promise<Record<string, any>> {
  const rows = await db()`select key, value from site_settings`;
  return Object.fromEntries(rows.map((r: { key: string; value: unknown }) => [r.key, r.value]));
}

// Tudo o que a home precisa numa chamada só.
export const homeRoutes = new Hono<AppEnv>().get("/home", async (c) => {
  const today = todayIn(config().TZ_BUSINESS);

  const [s, counts, categories, lotRows, highlights, regionRows] = await Promise.all([
    settings(),
    db()`
      select (select count(*)::int from producers) as producers,
             (select count(distinct (city, state))::int from producers) as municipalities,
             (select max(updated_at) from products) as "stockUpdatedAt"`,
    db()`
      select c.slug, c.name, c.description, c.icon,
        (select count(*)::int from products p where p.category_id = c.id and p.active) as "productCount"
      from categories c order by c.sort_order`,
    db()`
      select l.code, l.title, l.cure_days as "cureDays", l.image_url as "imageUrl", p.slug as "productSlug",
             pr.city, pr.state, pr.owner_name as "ownerName", pr.image_url as "producerImageUrl"
      from lots l join products p on p.id = l.product_id join producers pr on pr.id = p.producer_id
      where l.featured_from <= ${today} and (l.featured_until is null or l.featured_until >= ${today})
      order by l.featured_from desc limit 1`,
    listProducts({ featured: true, sort: "best_sellers", pageSize: 4 }),
    db()`select route_weekdays as "routeWeekdays", cutoff_days as "cutoffDays" from delivery_regions order by id limit 1`,
  ]);

  const c0 = counts[0];
  const region = regionRows[0];
  const nextRoute = region ? upcomingRoutes(today, region.routeWeekdays, region.cutoffDays, 1)[0] : undefined;
  const maxDiscount = Math.max(0, ...highlights.items.map((p) => p.wholesale.maxDiscountPct));

  return c.json({
    stats: [
      { value: s.delivery_hours ? `${s.delivery_hours}h` : "48h", label: "da serra ao seu destino" },
      { value: `+${s.partner_producers ?? c0.producers}`, label: "produtores parceiros" },
      { value: `${String(s.customer_rating ?? 4.9).replace(".", ",")}/5`, label: "avaliação dos clientes" },
      { value: `${s.cold_chain_monitored_pct ?? 100}%`, label: "cadeia refrigerada monitorada" },
    ],
    lotOfTheWeek: lotRows[0] ?? null,
    // O 5º card ("Compra em Lote") leva para o atacado, não para uma categoria.
    categories: [
      ...categories.map((cat: any) => ({ ...cat, href: `/produtos?categoria=${cat.slug}` })),
      { slug: "compra-em-lote", name: "Compra em Lote", description: "Caixas e paletes para negócio", icon: "boxes", href: "/atacado" },
    ],
    highlights: {
      items: highlights.items,
      maxWholesaleDiscountPct: maxDiscount,
      stockUpdatedAt: c0.stockUpdatedAt,
      nextColdShipment: nextRoute ? { date: nextRoute, weekday: weekdayName(nextRoute) } : null,
    },
    producerProgram: {
      onTimePickupPct: s.on_time_pickup_pct ?? 98,
      averagePaymentDays: s.average_payment_days ?? 7,
      municipalities: s.municipalities ?? c0.municipalities,
    },
    trust: {
      coldChainRange: { minC: 2, maxC: 8 },
      lotTraceabilityPct: 100,
      sanitaryCertifications: ["SIF", "SIM", "SIE", "Selo Arte"],
      partnerProducers: s.partner_producers ?? c0.producers,
    },
  });
});
