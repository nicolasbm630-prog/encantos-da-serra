export type PriceTier = { minBoxes: number; maxBoxes: number | null; unitPriceCents: number };
export type PurchaseMode = "unit" | "box";

export type PricedLine = {
  mode: PurchaseMode;
  quantity: number;
  units: number;
  unitPriceCents: number;
  totalCents: number;
  // Referência para "você economiza": no atacado é a 1ª faixa, no varejo é o próprio preço.
  referenceTotalCents: number;
  savingsCents: number;
  tier: PriceTier | null;
};

export function sortTiers(tiers: PriceTier[]): PriceTier[] {
  return [...tiers].sort((a, b) => a.minBoxes - b.minBoxes);
}

// Faixa aplicável à quantidade de caixas. Abaixo da primeira faixa, vale a primeira.
export function tierFor(tiers: PriceTier[], boxes: number): PriceTier {
  const sorted = sortTiers(tiers);
  if (sorted.length === 0) throw new Error("Produto sem faixas de atacado");
  const match = sorted.findLast((t) => boxes >= t.minBoxes && (t.maxBoxes === null || boxes <= t.maxBoxes));
  return match ?? sorted[0]!;
}

export function priceLine(input: {
  mode: PurchaseMode;
  quantity: number;
  retailPriceCents: number;
  boxSize: number;
  tiers: PriceTier[];
}): PricedLine {
  const { mode, quantity, retailPriceCents, boxSize, tiers } = input;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantidade inválida");

  if (mode === "unit") {
    const total = quantity * retailPriceCents;
    return {
      mode,
      quantity,
      units: quantity,
      unitPriceCents: retailPriceCents,
      totalCents: total,
      referenceTotalCents: total,
      savingsCents: 0,
      tier: null,
    };
  }

  const units = quantity * boxSize;
  const tier = tierFor(tiers, quantity);
  const base = sortTiers(tiers)[0]!;
  const total = units * tier.unitPriceCents;
  const reference = units * base.unitPriceCents;
  return {
    mode,
    quantity,
    units,
    unitPriceCents: tier.unitPriceCents,
    totalCents: total,
    referenceTotalCents: reference,
    savingsCents: reference - total,
    tier,
  };
}

// Maior desconto do atacado em relação ao varejo, em % inteiro ("ATÉ 22% OFF").
export function maxWholesaleDiscountPct(retailPriceCents: number, tiers: PriceTier[]): number {
  if (tiers.length === 0) return 0;
  const best = Math.min(...tiers.map((t) => t.unitPriceCents));
  return Math.max(0, Math.floor((1 - best / retailPriceCents) * 100));
}

export function sumLines(lines: Pick<PricedLine, "totalCents" | "savingsCents" | "referenceTotalCents">[]) {
  return lines.reduce(
    (acc, l) => ({
      totalCents: acc.totalCents + l.totalCents,
      savingsCents: acc.savingsCents + l.savingsCents,
      referenceTotalCents: acc.referenceTotalCents + l.referenceTotalCents,
    }),
    { totalCents: 0, savingsCents: 0, referenceTotalCents: 0 },
  );
}
