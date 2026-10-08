import { config } from "../config";
import { db } from "../db";
import { formatCep, parseCep, todayIn, upcomingRoutes, weekdayName } from "../lib/delivery";
import { AppError } from "../lib/errors";

export type Region = {
  id: number;
  name: string;
  routeWeekdays: number[];
  cutoffDays: number;
  feeCents: number;
  freeShippingOverCents: number | null;
  minTempC: string;
  maxTempC: string;
};

export async function regionForCep(cep: string): Promise<Region> {
  const cepNumber = parseCep(cep);
  const [region] = await db()`
    select id, name, route_weekdays as "routeWeekdays", cutoff_days as "cutoffDays", fee_cents as "feeCents",
           free_shipping_over_cents as "freeShippingOverCents", min_temp_c as "minTempC", max_temp_c as "maxTempC"
    from delivery_regions where ${cepNumber} between cep_start and cep_end
    order by (cep_end - cep_start) limit 1`;
  if (!region) throw new AppError(422, "out_of_area", `Ainda não entregamos no CEP ${formatCep(cepNumber)}`);
  return region as Region;
}

export function describeRegion(region: Region, count = 4) {
  const routes = upcomingRoutes(todayIn(config().TZ_BUSINESS), region.routeWeekdays, region.cutoffDays, count);
  return {
    region: region.name,
    feeCents: region.feeCents,
    freeShippingOverCents: region.freeShippingOverCents,
    temperatureRangeC: { min: Number(region.minTempC), max: Number(region.maxTempC) },
    nextDelivery: routes[0] ? { date: routes[0], weekday: weekdayName(routes[0]) } : null,
    upcomingRoutes: routes.map((date) => ({ date, weekday: weekdayName(date) })),
  };
}
