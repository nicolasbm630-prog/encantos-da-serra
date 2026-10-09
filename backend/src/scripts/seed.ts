import { closeDb, db } from "../db";
import { hashPassword } from "../lib/auth";
import { formatCnpj } from "../lib/cnpj";
import { normalize } from "../lib/text";
import { priceLine } from "../lib/pricing";
import { productSearchText } from "../repos/products";

// Dados de demonstração baseados no protótipo. Rode em banco vazio: `bun run db:seed`.
// Para recriar: `bun run db:seed --reset` (apaga TODOS os dados das tabelas do site).

const reset = process.argv.includes("--reset");
const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 8) {
  console.error("Defina SEED_PASSWORD (mín. 8 caracteres) no .env — vira a senha dos usuários de demonstração.");
  process.exit(1);
}

const sql = db();

const [{ count }] = await sql`select count(*)::int as count from products`;
if (count > 0 && !reset) {
  console.log("Banco já tem produtos — nada a fazer. Use --reset para recriar.");
  await closeDb();
  process.exit(0);
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

await sql.begin(async (tx) => {
  if (reset) {
    await tx.unsafe(`truncate users, business_accounts, producers, categories, products, price_tiers, lots, favorites,
      carts, cart_items, delivery_regions, orders, order_items, order_events, quote_requests, supplier_proposals,
      proposal_attachments, contact_messages, site_settings, stock_movements restart identity cascade`);
    // Sequências dos códigos (PED-, COT-, EDS-) não pertencem a nenhuma tabela: zerar à parte.
    await tx.unsafe(`alter sequence order_code_seq restart; alter sequence quote_code_seq restart;
      alter sequence proposal_protocol_seq restart`);
  }

  // Categorias
  const categories = [
    ["queijos-frescos", "Queijos Frescos", "Minas, ricota e coalho", "milk"],
    ["queijos-maturados", "Queijos Maturados", "Curas de 15 a 180 dias", "clock"],
    ["manteigas-derivados", "Manteigas & Derivados", "Manteiga, nata e requeijão", "butter"],
    ["doce-de-leite", "Doce de Leite", "Cremoso, em barra e zero açúcar", "jar"],
  ] as const;
  const cat: Record<string, number> = {};
  for (const [i, [slug, name, description, icon]] of categories.entries()) {
    const [row] = await tx`
      insert into categories (slug, name, description, icon, sort_order)
      values (${slug}, ${name}, ${description}, ${icon}, ${i}) returning id`;
    cat[slug] = row.id;
  }

  // Produtores
  const producers: { slug: string; name: string; owner: string; city: string; since: string; certs: string[]; story: string; image?: string }[] = [
    { slug: "fazenda-capao-grande", name: "Fazenda Capão Grande", owner: "Nair Ribeiro", image: "/images/site/dona-nair.jpg", city: "São Roque de Minas", since: "2019-03-01", certs: ["SIM", "Selo Arte"], story: "Canastra de leite cru feito há três gerações aos pés da serra." },
    { slug: "sitio-campo-alto", name: "Sítio Campo Alto", owner: "Antônio Prado", city: "Alagoa", since: "2020-07-15", certs: ["SIM", "Boas práticas"], story: "Rebanho A2A2 a pasto e manteiga de nata maturada." },
    { slug: "laticinio-serra-clara", name: "Laticínio Serra Clara", owner: "Helena Duarte", city: "Itamonte", since: "2018-05-10", certs: ["SIF"], story: "Queijos de mofo e longa cura na Mantiqueira." },
    { slug: "casa-dona-zita", name: "Casa Dona Zita", owner: "Zita Moreira", city: "Araxá", since: "2021-02-01", certs: ["SIE"], story: "Doce de leite mexido no tacho de cobre, receita de família." },
    { slug: "sitio-boa-vista", name: "Sítio Boa Vista", owner: "Maria e José Andrade", image: "/images/site/produtores-maria-jose.jpg", city: "Delfinópolis", since: "2020-01-20", certs: ["SIM", "Artesanal"], story: "Hoje produzimos com tranquilidade porque sabemos quando será a coleta e quando vamos receber." },
  ];
  const prod: Record<string, number> = {};
  for (const p of producers) {
    const [row] = await tx`
      insert into producers (slug, name, owner_name, city, state, story, partner_since, certifications, image_url, search_text)
      values (${p.slug}, ${p.name}, ${p.owner}, ${p.city}, 'MG', ${p.story}, ${p.since}, ${`{${p.certs.join(",")}}`}::text[],
              ${p.image ?? null},
              ${normalize(`${p.name} ${p.owner} ${p.city} ${p.certs.join(" ")}`)})
      returning id`;
    prod[p.slug] = row.id;
  }

  // Produtos: [varejo, caixa, faixas 1–4 / 5–11 / 12+] em centavos
  type Seed = {
    sku: string; slug: string; name: string; producer: string; category: string; unit: string; grams: number;
    retail: number; box: number; tiers: [number, number, number]; milk: string; tag?: string; cure?: number;
    badge?: string; awarded?: boolean; stockBoxes: number; featured?: boolean; sales: number; description: string;
  };
  const products: Seed[] = [
    { sku: "CAN-MC600", slug: "queijo-canastra-meia-cura", name: "Queijo Canastra Meia Cura", producer: "fazenda-capao-grande", category: "queijos-maturados", unit: "peça", grams: 600, retail: 5890, box: 12, tiers: [4980, 4690, 4320], milk: "vaca", tag: "Leite cru", cure: 22, badge: "Ouro • Queijo Brasil", awarded: true, stockBoxes: 184, featured: true, sales: 940, description: "Casca fina e amarelada, massa macia e levemente ácida. 22 dias de cura." },
    { sku: "MAN-C200", slug: "manteiga-de-cultivo", name: "Manteiga de Cultivo", producer: "sitio-campo-alto", category: "manteigas-derivados", unit: "pote", grams: 200, retail: 2950, box: 24, tiers: [2390, 2180, 1990], milk: "vaca", tag: "Leite A2A2", badge: "100% Artesanal", stockBoxes: 96, featured: true, sales: 810, description: "Nata maturada por 24 h, batida em pequenos lotes. Sal na medida." },
    { sku: "AZU-M480", slug: "queijo-azul-da-mantiqueira", name: "Queijo Azul da Mantiqueira", producer: "laticinio-serra-clara", category: "queijos-maturados", unit: "peça", grams: 480, retail: 7400, box: 8, tiers: [6660, 6290, 5840], milk: "vaca", tag: "Leite de vaca", cure: 60, badge: "Prata • Mondial", awarded: true, stockBoxes: 40, featured: true, sales: 420, description: "Veios azuis bem distribuídos, sabor intenso e final amanteigado." },
    { sku: "DDL-C450", slug: "doce-de-leite-cremoso", name: "Doce de Leite Cremoso", producer: "casa-dona-zita", category: "doce-de-leite", unit: "vidro", grams: 450, retail: 3490, box: 12, tiers: [2790, 2550, 2280], milk: "vaca", tag: "Receita de tacho", badge: "Produção Local", stockBoxes: 210, featured: true, sales: 1020, description: "Ponto de colher, cozido lentamente no tacho de cobre." },
    { sku: "MIN-F500", slug: "queijo-minas-frescal", name: "Queijo Minas Frescal", producer: "sitio-campo-alto", category: "queijos-frescos", unit: "peça", grams: 500, retail: 2490, box: 12, tiers: [1990, 1850, 1720], milk: "vaca", tag: "Leite A2A2", stockBoxes: 60, sales: 650, description: "Massa branca, úmida e suave. Consumir em até 10 dias." },
    { sku: "RIC-F400", slug: "ricota-fresca", name: "Ricota Fresca", producer: "laticinio-serra-clara", category: "queijos-frescos", unit: "peça", grams: 400, retail: 1690, box: 12, tiers: [1350, 1260, 1170], milk: "vaca", stockBoxes: 45, sales: 300, description: "Leve e aerada, ideal para recheios e cafés da manhã." },
    { sku: "CAB-F250", slug: "queijo-de-cabra-frescal", name: "Queijo de Cabra Frescal", producer: "sitio-boa-vista", category: "queijos-frescos", unit: "peça", grams: 250, retail: 3200, box: 10, tiers: [2650, 2490, 2290], milk: "cabra", tag: "Leite de cabra", badge: "100% Artesanal", stockBoxes: 25, sales: 210, description: "Fresco, cítrico e cremoso. Produção pequena, semanal." },
    { sku: "CAN-RC1K", slug: "canastra-real-curado", name: "Canastra Real Curado", producer: "fazenda-capao-grande", category: "queijos-maturados", unit: "peça", grams: 1000, retail: 11900, box: 6, tiers: [9990, 9490, 8990], milk: "vaca", tag: "Leite cru", cure: 90, badge: "Super Ouro • Mondial", awarded: true, stockBoxes: 18, sales: 180, description: "90 dias de cura: casca firme, massa cristalina e sabor profundo." },
    { sku: "TUL-180", slug: "queijo-tulha-180-dias", name: "Queijo Tulha 180 dias", producer: "laticinio-serra-clara", category: "queijos-maturados", unit: "peça", grams: 1200, retail: 14900, box: 4, tiers: [12900, 12300, 11600], milk: "vaca", cure: 180, badge: "Edição limitada", stockBoxes: 8, sales: 60, description: "Longa maturação em tulha de madeira. Notas de castanha." },
    { sku: "REQ-C500", slug: "requeijao-de-corte", name: "Requeijão de Corte", producer: "casa-dona-zita", category: "manteigas-derivados", unit: "peça", grams: 500, retail: 3990, box: 10, tiers: [3290, 3090, 2890], milk: "vaca", tag: "Receita mineira", stockBoxes: 30, sales: 260, description: "Casquinha dourada e massa firme que derrete na chapa." },
    { sku: "DDL-B300", slug: "doce-de-leite-em-barra", name: "Doce de Leite em Barra", producer: "casa-dona-zita", category: "doce-de-leite", unit: "barra", grams: 300, retail: 2250, box: 20, tiers: [1790, 1650, 1520], milk: "vaca", tag: "Receita de tacho", stockBoxes: 70, sales: 390, description: "Cortado à faca, textura açucarada por fora e macia por dentro." },
    { sku: "DDL-Z400", slug: "doce-de-leite-zero-acucar", name: "Doce de Leite Zero Açúcar", producer: "casa-dona-zita", category: "doce-de-leite", unit: "vidro", grams: 400, retail: 3890, box: 12, tiers: [3190, 2990, 2790], milk: "vaca", tag: "Zero açúcar", stockBoxes: 35, sales: 150, description: "Adoçado com eritritol, mesma cremosidade do tradicional." },
  ];

  const productIds: Record<string, number> = {};
  for (const p of products) {
    const [row] = await tx`
      insert into products (slug, sku, name, description, producer_id, category_id, unit_label, weight_grams,
        retail_price_cents, box_size, milk_type, detail_tag, cure_days, badge, awarded, stock_units, min_stock_units,
        featured, sales_count, search_text, image_url)
      values (${p.slug}, ${p.sku}, ${p.name}, ${p.description}, ${prod[p.producer]}, ${cat[p.category]}, ${p.unit},
        ${p.grams}, ${p.retail}, ${p.box}, ${p.milk}, ${p.tag ?? null}, ${p.cure ?? null}, ${p.badge ?? null},
        ${p.awarded ?? false}, ${p.stockBoxes * p.box}, ${p.box * 3}, ${p.featured ?? false}, ${p.sales},
        ${productSearchText({ name: p.name, sku: p.sku, description: p.description, badge: p.badge, detailTag: p.tag })},
        ${`/images/products/${p.slug}.jpg`})
      returning id`;
    productIds[p.sku] = row.id;
    await tx`
      insert into stock_movements (product_id, kind, quantity, stock_after, note, created_at)
      values (${row.id}, 'entrada', ${p.stockBoxes * p.box}, ${p.stockBoxes * p.box}, 'Estoque inicial', now() - interval '10 days')`;
    const [t1, t2, t3] = p.tiers;
    await tx`
      insert into price_tiers (product_id, min_boxes, max_boxes, unit_price_cents) values
        (${row.id}, 1, 4, ${t1}), (${row.id}, 5, 11, ${t2}), (${row.id}, 12, null, ${t3})`;
    await tx`
      insert into lots (code, product_id, title, produced_on, cure_days)
      values (${`${p.sku}-L${day(-(p.cure ?? 3)).replaceAll("-", "")}`}, ${row.id}, ${`Lote ${p.name}`},
              ${day(-(p.cure ?? 3))}, ${p.cure ?? null})`;
  }

  // Lote da semana
  await tx`
    insert into lots (code, product_id, title, produced_on, cure_days, notes, image_url, featured_from, featured_until)
    values ('CAN-NAIR-' || to_char(now(), 'IYYY-IW'), ${productIds["CAN-MC600"]}, 'Canastra da Dona Nair',
            ${day(-22)}, 22, 'Leite cru da ordenha da manhã, prensado à mão.', '/images/site/dona-nair.jpg',
            ${day(-3)}, ${day(4)})`;

  // Regiões de entrega (0 = domingo … 6 = sábado)
  const regions = [
    ["Belo Horizonte e região", 30000000, 34999999, [2, 4], 1, 1990, 20000],
    ["Interior de Minas Gerais", 35000000, 39999999, [2, 5], 1, 2990, 25000],
    ["São Paulo — capital e Grande SP", 1000000, 9999999, [2], 2, 3990, 35000],
    ["Interior e litoral de São Paulo", 11000000, 19999999, [4], 2, 4290, 40000],
    ["Rio de Janeiro", 20000000, 28999999, [3], 2, 4490, 40000],
  ] as const;
  for (const [name, start, end, days, cutoff, fee, free] of regions) {
    await tx`
      insert into delivery_regions (name, cep_start, cep_end, route_weekdays, cutoff_days, fee_cents, free_shipping_over_cents)
      values (${name}, ${start}, ${end}, ${`{${days.join(",")}}`}::int[], ${cutoff}, ${fee}, ${free})`;
  }

  // Números institucionais
  const settings: Record<string, unknown> = {
    delivery_hours: 48,
    customer_rating: 4.9,
    cold_chain_monitored_pct: 100,
    partner_producers: 120,
    municipalities: 62,
    on_time_pickup_pct: 98,
    average_payment_days: 7,
  };
  for (const [key, value] of Object.entries(settings)) {
    await tx`insert into site_settings (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)`;
  }

  // Usuários de demonstração (senha = SEED_PASSWORD)
  const hash = await hashPassword(seedPassword);
  await tx`insert into users (name, email, password_hash, role) values ('Admin', 'admin@encantos.test', ${hash}, 'admin')`;
  await tx`insert into users (name, email, password_hash, role) values ('Cliente Demo', 'cliente@encantos.test', ${hash}, 'customer')`;
  const [buyer] = await tx`
    insert into users (name, email, password_hash, role) values ('Compras Vila Nova', 'compras@encantos.test', ${hash}, 'business')
    returning id`;
  await tx`
    insert into business_accounts (user_id, trade_name, legal_name, cnpj, price_table, price_table_valid_until, account_manager)
    values (${buyer.id}, 'Empório Vila Nova', 'Empório Vila Nova Ltda.', ${formatCnpj("11222333000181")}, 'B2B Sudeste',
            ${day(30)}, 'Equipe comercial Encantos')`;
  const [admin] = await tx`select id from users where email = 'admin@encantos.test'`;
  const [customer] = await tx`select id from users where email = 'cliente@encantos.test'`;

  // ---- Pedidos de demonstração (alimentam o painel de estoque e pedidos) ----
  const STEPS = [
    ["pending", "Pedido recebido. Aguardando confirmação do pagamento.", null],
    ["confirmed", "Pagamento confirmado.", null],
    ["preparing", "Pedido em separação na câmara fria.", 3.8],
    ["in_transit", "Saiu na rota refrigerada.", 4.1],
    ["delivered", "Entregue ao destinatário.", 5.0],
  ] as const;
  const ADDRESSES = {
    cliente: { cep: "37925000", address: { recipient: "Cliente Demo", street: "Rua das Flores", number: "100", district: "Centro", city: "Piumhi", state: "MG" } },
    emporio: { cep: "01310100", address: { recipient: "Empório Vila Nova", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" } },
  };

  async function seedOrder(o: { who: "cliente" | "emporio"; status: (typeof STEPS)[number][0]; hoursAgo: number; items: { sku: string; mode: "unit" | "box"; quantity: number }[] }) {
    const userId = o.who === "cliente" ? customer.id : buyer.id;
    const { cep, address } = ADDRESSES[o.who];
    const [region] = await tx`select id, fee_cents from delivery_regions where ${Number(cep)} between cep_start and cep_end limit 1`;
    const lines = [];
    for (const it of o.items) {
      const [p] = await tx`
        select p.id, p.name, p.retail_price_cents, p.box_size,
          (select json_agg(json_build_object('minBoxes', t.min_boxes, 'maxBoxes', t.max_boxes, 'unitPriceCents', t.unit_price_cents))
             from price_tiers t where t.product_id = p.id) as tiers
        from products p where p.sku = ${it.sku}`;
      const tiers = typeof p.tiers === "string" ? JSON.parse(p.tiers) : p.tiers;
      lines.push({ ...priceLine({ mode: it.mode, quantity: it.quantity, retailPriceCents: p.retail_price_cents, boxSize: p.box_size, tiers }), productId: p.id, name: p.name });
    }
    const subtotal = lines.reduce((a, l) => a + l.totalCents, 0);
    const createdAt = new Date(Date.now() - o.hoursAgo * 3_600_000).toISOString();
    const stepIndex = STEPS.findIndex((st) => st[0] === o.status);
    const shipped = stepIndex >= 3;
    const [order] = await tx`
      insert into orders (user_id, channel, status, subtotal_cents, shipping_cents, total_cents, cep, address,
                          delivery_region_id, scheduled_delivery, created_at, updated_at, shipped_at)
      values (${userId}, ${lines.some((l) => l.mode === "box") ? "wholesale" : "retail"}, ${o.status}, ${subtotal},
              ${region.fee_cents}, ${subtotal + region.fee_cents}, ${cep}, ${JSON.stringify(address)}::jsonb, ${region.id},
              ${day(shipped ? -Math.floor(o.hoursAgo / 24) + 1 : 2)}, ${createdAt}, ${createdAt},
              ${shipped ? new Date(Date.now() - (o.hoursAgo - 12) * 3_600_000).toISOString() : null})
      returning id, code`;
    for (const l of lines) {
      await tx`
        insert into order_items (order_id, product_id, lot_id, product_name, mode, quantity, units, unit_price_cents, total_cents)
        values (${order.id}, ${l.productId}, (select id from lots where product_id = ${l.productId} order by produced_on desc limit 1),
                ${l.name}, ${l.mode}, ${l.quantity}, ${l.units}, ${l.unitPriceCents}, ${l.totalCents})`;
      await tx`update products set sales_count = sales_count + ${l.units} where id = ${l.productId}`;
      if (shipped) {
        const [after] = await tx`update products set stock_units = stock_units - ${l.units} where id = ${l.productId} returning stock_units`;
        await tx`
          insert into stock_movements (product_id, kind, quantity, stock_after, note, order_id, user_id, created_at)
          values (${l.productId}, 'expedicao', ${-l.units}, ${after.stock_units}, ${`Pedido ${order.code}`}, ${order.id}, ${admin.id},
                  ${new Date(Date.now() - (o.hoursAgo - 12) * 3_600_000).toISOString()})`;
      }
    }
    for (let i = 0; i <= stepIndex; i++) {
      const [status, message, temp] = STEPS[i]!;
      await tx`
        insert into order_events (order_id, status, message, temperature_c, created_at)
        values (${order.id}, ${status}, ${message}, ${temp}, ${new Date(Date.now() - (o.hoursAgo - i * 6) * 3_600_000).toISOString()})`;
    }
  }

  await seedOrder({ who: "cliente", status: "delivered", hoursAgo: 150, items: [{ sku: "CAN-MC600", mode: "unit", quantity: 2 }] });
  await seedOrder({ who: "emporio", status: "in_transit", hoursAgo: 30, items: [{ sku: "MAN-C200", mode: "box", quantity: 6 }] });
  await seedOrder({ who: "emporio", status: "preparing", hoursAgo: 52, items: [{ sku: "TUL-180", mode: "box", quantity: 3 }] });

  // Perda registrada no Tulha depois que os primeiros pedidos entraram: o físico não cobre mais tudo.
  const [tulha] = await tx`update products set stock_units = stock_units - 4 where sku = 'TUL-180' returning id, stock_units`;
  await tx`
    insert into stock_movements (product_id, kind, quantity, stock_after, note, user_id, created_at)
    values (${tulha.id}, 'perda', -4, ${tulha.stock_units}, 'Peças com trinca na casca', ${admin.id}, now() - interval '40 hours')`;

  await seedOrder({ who: "emporio", status: "confirmed", hoursAgo: 26, items: [{ sku: "TUL-180", mode: "box", quantity: 6 }, { sku: "AZU-M480", mode: "box", quantity: 2 }] });
  await seedOrder({ who: "emporio", status: "pending", hoursAgo: 8, items: [{ sku: "CAN-RC1K", mode: "box", quantity: 16 }] });
  await seedOrder({ who: "cliente", status: "pending", hoursAgo: 3, items: [{ sku: "TUL-180", mode: "unit", quantity: 1 }, { sku: "DDL-C450", mode: "unit", quantity: 2 }] });
});

console.log("Seed concluído: 4 categorias, 5 produtores, 12 produtos, 5 regiões, 3 usuários e 6 pedidos de demonstração.");
console.log("Logins: admin@encantos.test, cliente@encantos.test, compras@encantos.test (senha = SEED_PASSWORD).");
await closeDb();
