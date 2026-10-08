// Cliente da API (o servidor do site repassa /api para o backend).

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => { authToken = token; };

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`/api${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Algo deu errado", Array.isArray(e.details) ? e.details : undefined);
  }
  return data as T;
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
};

// ---- Tipos das respostas ----

export type Tier = { minBoxes: number; maxBoxes: number | null; unitPriceCents: number };

export type Product = {
  id: number;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  badge: string | null;
  awarded: boolean;
  detailTag: string | null;
  milkType: string;
  cureDays: number | null;
  weightGrams: number;
  featured: boolean;
  producer: { id: number; slug: string; name: string; city: string; state: string };
  category: { id: number; slug: string; name: string };
  retail: { priceCents: number; unitLabel: string; priceLabel: string };
  wholesale: { boxSize: number; boxLabel: string; fromUnitPriceCents: number | null; maxDiscountPct: number; tiers: Tier[] };
  stock: { units: number; boxes: number; available: boolean };
};

export type ProductList = { items: Product[]; page: number; pageSize: number; total: number; totalPages: number };

export type Home = {
  stats: { value: string; label: string }[];
  lotOfTheWeek: null | { code: string; title: string; cureDays: number | null; imageUrl: string | null; productSlug: string; city: string; state: string; ownerName: string | null; producerImageUrl: string | null };
  categories: { slug: string; name: string; description: string; icon: string; href: string; productCount?: number }[];
  highlights: { items: Product[]; maxWholesaleDiscountPct: number; stockUpdatedAt: string; nextColdShipment: { date: string; weekday: string } | null };
  producerProgram: { onTimePickupPct: number; averagePaymentDays: number; municipalities: number };
  trust: { coldChainRange: { minC: number; maxC: number }; lotTraceabilityPct: number; sanitaryCertifications: string[]; partnerProducers: number };
};

export type User = { id: number; name: string; email: string; role: "customer" | "business" | "producer" | "admin" };

export type CartLine = {
  itemId: number;
  product: { id: number; slug: string; sku: string; name: string; imageUrl: string | null; producerName: string; unitLabel: string; boxLabel: string };
  mode: "unit" | "box";
  quantity: number;
  units: number;
  unitPriceCents: number;
  totalCents: number;
  savingsCents: number;
  availableUnits: number;
  issue: string | null;
};

export type Cart = { token: string; lines: CartLine[]; totals: { units: number; boxes: number; subtotalCents: number; savingsCents: number }; hasIssues?: boolean };

export type Order = {
  id: number;
  code: string;
  channel: "retail" | "wholesale";
  status: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  cep: string;
  scheduledDelivery: string | null;
  deliveryRegion: string | null;
  createdAt: string;
  items: { productName: string; mode: string; quantity: number; units: number; unitPriceCents: number; totalCents: number; lot: { code: string; producedOn: string; cureDays: number | null } | null }[];
  timeline: { status: string; message: string; temperatureC: string | number | null; at: string }[];
};

export type DeliveryInfo = {
  cep: string;
  region: string;
  feeCents: number;
  freeShippingOverCents: number | null;
  temperatureRangeC: { min: number; max: number };
  nextDelivery: { date: string; weekday: string } | null;
  upcomingRoutes: { date: string; weekday: string }[];
};
