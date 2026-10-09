// Cobertura de pedidos abertos pelo estoque físico, por ordem de chegada (o mais antigo primeiro).
// Responde: "tenho estoque para os pedidos que ainda não saíram?"

export type CoverageOrder = {
  id: number;
  createdAt: string | Date;
  items: { productId: number; units: number }[];
};

export type ItemCoverage = { productId: number; units: number; allocated: number; short: number };
export type OrderCoverage = { orderId: number; status: "covered" | "partial" | "uncovered"; shortUnits: number; items: ItemCoverage[] };

export function computeCoverage(orders: CoverageOrder[], onHand: Map<number, number>) {
  const remaining = new Map(onHand);
  const sorted = [...orders].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id - b.id);
  const byOrder = new Map<number, OrderCoverage>();
  const shortByProduct = new Map<number, number>();

  for (const order of sorted) {
    const items = order.items.map((it) => {
      const left = Math.max(0, remaining.get(it.productId) ?? 0);
      const allocated = Math.min(left, it.units);
      remaining.set(it.productId, left - allocated);
      const short = it.units - allocated;
      if (short > 0) shortByProduct.set(it.productId, (shortByProduct.get(it.productId) ?? 0) + short);
      return { productId: it.productId, units: it.units, allocated, short };
    });
    const shortUnits = items.reduce((acc, i) => acc + i.short, 0);
    const allocatedUnits = items.reduce((acc, i) => acc + i.allocated, 0);
    byOrder.set(order.id, {
      orderId: order.id,
      status: shortUnits === 0 ? "covered" : allocatedUnits === 0 ? "uncovered" : "partial",
      shortUnits,
      items,
    });
  }
  return { byOrder, shortByProduct };
}
