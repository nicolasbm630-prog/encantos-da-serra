import { describe, expect, test } from "bun:test";
import { maxWholesaleDiscountPct, priceLine, sumLines, tierFor, type PriceTier } from "../src/lib/pricing";

// Faixas do Canastra Meia Cura no protótipo: 1–4 / 5–11 / 12+ caixas.
const canastra: PriceTier[] = [
  { minBoxes: 12, maxBoxes: null, unitPriceCents: 4320 },
  { minBoxes: 1, maxBoxes: 4, unitPriceCents: 4980 },
  { minBoxes: 5, maxBoxes: 11, unitPriceCents: 4690 },
];

describe("tierFor", () => {
  test("escolhe a faixa pela quantidade de caixas", () => {
    expect(tierFor(canastra, 1).unitPriceCents).toBe(4980);
    expect(tierFor(canastra, 4).unitPriceCents).toBe(4980);
    expect(tierFor(canastra, 5).unitPriceCents).toBe(4690);
    expect(tierFor(canastra, 11).unitPriceCents).toBe(4690);
    expect(tierFor(canastra, 12).unitPriceCents).toBe(4320);
    expect(tierFor(canastra, 500).unitPriceCents).toBe(4320);
  });

  test("abaixo da primeira faixa usa a primeira", () => {
    expect(tierFor([{ minBoxes: 3, maxBoxes: null, unitPriceCents: 100 }], 1).unitPriceCents).toBe(100);
  });

  test("falha sem faixas", () => {
    expect(() => tierFor([], 1)).toThrow();
  });
});

describe("priceLine", () => {
  const base = { retailPriceCents: 5890, boxSize: 12, tiers: canastra };

  test("varejo cobra preço unitário sem economia", () => {
    const line = priceLine({ ...base, mode: "unit", quantity: 3 });
    expect(line).toMatchObject({ units: 3, unitPriceCents: 5890, totalCents: 17670, savingsCents: 0, tier: null });
  });

  test("atacado multiplica caixas pelo tamanho da caixa e aplica a faixa", () => {
    const line = priceLine({ ...base, mode: "box", quantity: 8 });
    expect(line.units).toBe(96);
    expect(line.unitPriceCents).toBe(4690);
    expect(line.totalCents).toBe(96 * 4690);
    // economia em relação à 1ª faixa
    expect(line.savingsCents).toBe(96 * (4980 - 4690));
  });

  test("1ª faixa não tem economia", () => {
    expect(priceLine({ ...base, mode: "box", quantity: 2 }).savingsCents).toBe(0);
  });

  test("rejeita quantidade inválida", () => {
    expect(() => priceLine({ ...base, mode: "unit", quantity: 0 })).toThrow();
    expect(() => priceLine({ ...base, mode: "box", quantity: 1.5 })).toThrow();
  });
});

test("maxWholesaleDiscountPct compara a melhor faixa com o varejo", () => {
  expect(maxWholesaleDiscountPct(5890, canastra)).toBe(26);
  expect(maxWholesaleDiscountPct(5890, [])).toBe(0);
});

test("sumLines soma totais e economia", () => {
  expect(
    sumLines([
      { totalCents: 100, savingsCents: 10, referenceTotalCents: 110 },
      { totalCents: 50, savingsCents: 0, referenceTotalCents: 50 },
    ]),
  ).toEqual({ totalCents: 150, savingsCents: 10, referenceTotalCents: 160 });
});
