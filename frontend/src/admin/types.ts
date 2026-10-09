export type Coverage = "covered" | "partial" | "uncovered";

export type BoardOrder = {
  id: number;
  code: string;
  channel: "retail" | "wholesale";
  status: string;
  totalCents: number;
  createdAt: string;
  scheduledDelivery: string | null;
  shippedAt: string | null;
  cep: string;
  customerName: string;
  customerEmail: string;
  tradeName: string | null;
  region: string | null;
  coverage: Coverage | null;
  shortUnits: number;
  nextStatuses: string[];
  items: { productId: number; name: string; sku: string; imageUrl: string | null; mode: "unit" | "box"; quantity: number; units: number; totalCents: number; allocated: number; short: number }[];
};

export type Board = {
  orders: BoardOrder[];
  summary: { openOrders: number; openValueCents: number; readyToShip: number; inTransit: number; nextRoute: string | null; uncoveredOrders: number };
};

export type StockStatus = "falta" | "zerado" | "baixo" | "ok";

export type InventoryProduct = {
  id: number;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitLabel: string;
  boxSize: number;
  minStockUnits: number;
  active: boolean;
  producerName: string;
  onHand: number;
  reserved: number;
  available: number;
  lastMovementAt: string | null;
  shortUnits: number;
  openOrders: number;
  status: StockStatus;
};

export type Inventory = {
  products: InventoryProduct[];
  summary: { skus: number; withShortage: number; belowMinimum: number; reservedUnits: number; onHandUnits: number };
};

export type Movement = { id: number; kind: string; quantity: number; stockAfter: number; note: string | null; createdAt: string; orderCode: string | null; userName: string | null };

export const MOVEMENT_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  perda: "Perda",
  contagem: "Contagem",
  expedicao: "Expedição",
  devolucao: "Devolução",
};

export const STOCK_LABEL: Record<StockStatus, string> = {
  falta: "Falta p/ pedidos",
  zerado: "Sem saldo",
  baixo: "Abaixo do mínimo",
  ok: "OK",
};

// Botão principal de cada etapa do pedido.
export const NEXT_ACTION: Record<string, string> = {
  confirmed: "Confirmar",
  preparing: "Separar",
  in_transit: "Expedir",
  delivered: "Marcar entregue",
};

export const NEXT_MESSAGE: Record<string, string> = {
  confirmed: "Pagamento confirmado.",
  preparing: "Pedido em separação na câmara fria.",
  in_transit: "Saiu na rota refrigerada.",
  delivered: "Entregue ao destinatário.",
  cancelled: "Pedido cancelado.",
};

// "28 un · 7 cx". Valores negativos (faltas) arredondam a caixa para cima: 9 un em caixas de 4 = 3 cx.
export const unitsBoxes = (units: number, boxSize: number) => {
  const boxes = units < 0 ? Math.ceil(-units / boxSize) : Math.floor(units / boxSize);
  return `${units.toLocaleString("pt-BR")} un${boxSize > 1 && boxes > 0 ? ` · ${units < 0 ? "−" : ""}${boxes} cx` : ""}`;
};

export const boxesNeeded = (units: number, boxSize: number) => Math.ceil(units / boxSize);

export const timeAgo = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
};
