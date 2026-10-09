import { expect, test } from "bun:test";
import { computeCoverage } from "../src/lib/coverage";

const order = (id: number, day: number, items: [number, number][]) => ({
  id,
  createdAt: `2026-10-0${day}T10:00:00Z`,
  items: items.map(([productId, units]) => ({ productId, units })),
});

test("pedido mais antigo tem prioridade no estoque", () => {
  const { byOrder, shortByProduct } = computeCoverage(
    // o pedido 2 chegou antes do 1
    [order(1, 3, [[10, 24]]), order(2, 1, [[10, 12]])],
    new Map([[10, 32]]),
  );
  expect(byOrder.get(2)).toMatchObject({ status: "covered", shortUnits: 0 });
  expect(byOrder.get(1)).toMatchObject({ status: "partial", shortUnits: 4 });
  expect(byOrder.get(1)!.items[0]).toEqual({ productId: 10, units: 24, allocated: 20, short: 4 });
  expect(shortByProduct.get(10)).toBe(4);
});

test("sem estoque nenhum o pedido fica descoberto", () => {
  const { byOrder } = computeCoverage([order(1, 1, [[10, 5], [11, 2]])], new Map([[10, 0]]));
  expect(byOrder.get(1)).toMatchObject({ status: "uncovered", shortUnits: 7 });
});

test("cada produto é alocado de forma independente", () => {
  const { byOrder } = computeCoverage(
    [order(1, 1, [[10, 5], [11, 5]]), order(2, 2, [[11, 1]])],
    new Map([[10, 100], [11, 5]]),
  );
  expect(byOrder.get(1)!.status).toBe("covered");
  expect(byOrder.get(2)!.status).toBe("uncovered");
});

test("estoque físico negativo é tratado como zero", () => {
  const { byOrder } = computeCoverage([order(1, 1, [[10, 1]])], new Map([[10, -3]]));
  expect(byOrder.get(1)!.status).toBe("uncovered");
});
