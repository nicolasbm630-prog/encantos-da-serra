import { describe, expect, test } from "bun:test";
import { formatCep, parseCep, shippingCents, todayIn, upcomingRoutes, weekdayName } from "../src/lib/delivery";

describe("CEP", () => {
  test("aceita com ou sem hífen", () => {
    expect(parseCep("37928-000")).toBe(37928000);
    expect(parseCep("01310100")).toBe(1310100);
    expect(formatCep(1310100)).toBe("01310-100");
  });
  test("rejeita CEP incompleto", () => {
    expect(() => parseCep("1234")).toThrow("CEP inválido");
  });
});

describe("upcomingRoutes", () => {
  // 2026-10-08 é quinta-feira
  test("respeita o prazo de corte", () => {
    // rota às terças (2), corte de 1 dia → próxima terça
    expect(upcomingRoutes("2026-10-08", [2], 1, 2)).toEqual(["2026-10-13", "2026-10-20"]);
  });
  test("rota no dia seguinte entra se o corte permitir", () => {
    // sexta (5) com corte de 1 dia → amanhã
    expect(upcomingRoutes("2026-10-08", [5], 1, 1)).toEqual(["2026-10-09"]);
    // com corte de 2 dias, pula para a outra sexta
    expect(upcomingRoutes("2026-10-08", [5], 2, 1)).toEqual(["2026-10-16"]);
  });
  test("vários dias por semana saem em ordem", () => {
    expect(upcomingRoutes("2026-10-08", [2, 5], 1, 3)).toEqual(["2026-10-09", "2026-10-13", "2026-10-16"]);
  });
  test("sem dias de rota não retorna nada", () => {
    expect(upcomingRoutes("2026-10-08", [], 1, 3)).toEqual([]);
  });
});

test("weekdayName em português", () => {
  expect(weekdayName("2026-10-13")).toBe("terça-feira");
});

test("todayIn usa o fuso do negócio", () => {
  // 01:30 UTC do dia 9 ainda é dia 8 em São Paulo
  expect(todayIn("America/Sao_Paulo", new Date("2026-10-09T01:30:00Z"))).toBe("2026-10-08");
});

test("frete grátis acima do limite", () => {
  const region = { feeCents: 2990, freeShippingOverCents: 25000 };
  expect(shippingCents(region, 24999)).toBe(2990);
  expect(shippingCents(region, 25000)).toBe(0);
  expect(shippingCents({ feeCents: 2990, freeShippingOverCents: null }, 999999)).toBe(2990);
});
