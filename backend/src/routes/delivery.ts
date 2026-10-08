import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db";
import { formatCep, parseCep, todayIn, upcomingRoutes, weekdayName } from "../lib/delivery";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";
import { describeRegion, regionForCep } from "../repos/delivery";

export const deliveryRoutes = new Hono<AppEnv>()
  // "Consulte sua região e o próximo dia de rota."
  .get("/cep/:cep", async (c) => {
    const cep = c.req.param("cep");
    const region = await regionForCep(cep);
    return c.json({ cep: formatCep(parseCep(cep)), ...describeRegion(region) });
  })

  // "Calendário de rotas" para compradores B2B.
  .get("/routes", validate("query", z.object({ weeks: z.coerce.number().int().min(1).max(8).default(4) })), async (c) => {
    const { weeks } = c.req.valid("query");
    const today = todayIn(config().TZ_BUSINESS);
    const regions = await db()`
      select id, name, route_weekdays as "routeWeekdays", cutoff_days as "cutoffDays",
             cep_start as "cepStart", cep_end as "cepEnd"
      from delivery_regions order by name`;
    return c.json({
      regions: regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        cepRange: [formatCep(r.cepStart), formatCep(r.cepEnd)],
        cutoffDays: r.cutoffDays,
        routes: upcomingRoutes(today, r.routeWeekdays, r.cutoffDays, weeks * r.routeWeekdays.length).map((date) => ({
          date,
          weekday: weekdayName(date),
        })),
      })),
    });
  });
