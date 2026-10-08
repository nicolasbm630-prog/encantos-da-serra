-- Encantos da Serra — schema inicial
-- Valores monetários em centavos (integer). Datas em timestamptz.
-- RLS fica ligado em todas as tabelas e sem políticas: o acesso acontece só pelo
-- backend (conexão Postgres direta), nunca pela REST pública do Supabase.

create sequence order_code_seq start 1;
create sequence quote_code_seq start 1;
create sequence proposal_protocol_seq start 1001;

create table users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'business', 'producer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conta de comprador B2B (empório, restaurante, rede).
create table business_accounts (
  id serial primary key,
  user_id integer not null unique references users(id) on delete cascade,
  trade_name text not null,
  legal_name text,
  cnpj text not null unique,
  price_table text not null default 'B2B Sudeste',
  price_table_valid_until date,
  account_manager text,
  created_at timestamptz not null default now()
);

create table producers (
  id serial primary key,
  user_id integer references users(id) on delete set null,
  slug text not null unique,
  name text not null,
  owner_name text,
  city text not null,
  state text not null default 'MG',
  story text,
  image_url text,
  partner_since date,
  certifications text[] not null default '{}',
  search_text text not null default '',
  created_at timestamptz not null default now()
);

create table categories (
  id serial primary key,
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  sort_order integer not null default 0
);

create table products (
  id serial primary key,
  slug text not null unique,
  sku text not null unique,
  name text not null,
  description text,
  producer_id integer not null references producers(id),
  category_id integer not null references categories(id),
  unit_label text not null,                -- peça, pote, vidro…
  weight_grams integer not null check (weight_grams > 0),
  retail_price_cents integer not null check (retail_price_cents > 0),
  box_size integer not null check (box_size > 0), -- unidades por caixa no atacado
  milk_type text not null check (milk_type in ('vaca', 'cabra', 'bufala', 'misto', 'nenhum')),
  detail_tag text,                         -- "Leite cru", "Leite A2A2", "Receita de tacho"
  cure_days integer,
  badge text,                              -- "Ouro • Queijo Brasil", "100% Artesanal"
  awarded boolean not null default false,
  image_url text,
  stock_units integer not null default 0 check (stock_units >= 0),
  featured boolean not null default false,
  active boolean not null default true,
  sales_count integer not null default 0,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on products (category_id);
create index products_producer_idx on products (producer_id);

-- Faixas do atacado: preço por unidade conforme a quantidade de caixas.
create table price_tiers (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  min_boxes integer not null check (min_boxes >= 1),
  max_boxes integer check (max_boxes is null or max_boxes >= min_boxes),
  unit_price_cents integer not null check (unit_price_cents > 0),
  unique (product_id, min_boxes)
);

-- Lote rastreável (origem, data de produção, cura). Também alimenta o "Lote da semana".
create table lots (
  id serial primary key,
  code text not null unique,
  product_id integer not null references products(id),
  title text not null,
  produced_on date not null,
  cure_days integer,
  notes text,
  image_url text,
  featured_from date,
  featured_until date,
  created_at timestamptz not null default now()
);
create index lots_product_idx on lots (product_id, produced_on desc);

create table favorites (
  user_id integer not null references users(id) on delete cascade,
  product_id integer not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Carrinho identificado por token (funciona para visitante) e opcionalmente ligado ao usuário.
create table carts (
  id serial primary key,
  token text not null unique,
  user_id integer references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id serial primary key,
  cart_id integer not null references carts(id) on delete cascade,
  product_id integer not null references products(id),
  mode text not null check (mode in ('unit', 'box')),
  quantity integer not null check (quantity > 0),
  unique (cart_id, product_id, mode)
);

-- Entrega refrigerada por faixa de CEP e dias de rota (0 = domingo … 6 = sábado).
create table delivery_regions (
  id serial primary key,
  name text not null,
  cep_start integer not null,
  cep_end integer not null check (cep_end >= cep_start),
  route_weekdays integer[] not null,
  cutoff_days integer not null default 1,
  fee_cents integer not null,
  free_shipping_over_cents integer,
  min_temp_c numeric(4,1) not null default 2,
  max_temp_c numeric(4,1) not null default 8
);

create table orders (
  id serial primary key,
  code text not null unique
    default ('PED-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_code_seq')::text, 6, '0')),
  user_id integer not null references users(id),
  channel text not null check (channel in ('retail', 'wholesale')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'preparing', 'in_transit', 'delivered', 'cancelled')),
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  shipping_cents integer not null,
  total_cents integer not null,
  cep text not null,
  address jsonb not null,
  delivery_region_id integer references delivery_regions(id),
  scheduled_delivery date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on orders (user_id, created_at desc);

create table order_items (
  id serial primary key,
  order_id integer not null references orders(id) on delete cascade,
  product_id integer not null references products(id),
  lot_id integer references lots(id),
  product_name text not null,
  mode text not null check (mode in ('unit', 'box')),
  quantity integer not null,
  units integer not null,
  unit_price_cents integer not null,
  total_cents integer not null
);
create index order_items_order_idx on order_items (order_id);

-- Linha do tempo do pedido: rastreio + temperatura da cadeia fria.
create table order_events (
  id serial primary key,
  order_id integer not null references orders(id) on delete cascade,
  status text not null,
  message text not null,
  temperature_c numeric(4,1),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, created_at);

-- "Pedir Cotação para Grande Volume"
create table quote_requests (
  id serial primary key,
  code text not null unique
    default ('COT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quote_code_seq')::text, 4, '0')),
  user_id integer not null references users(id),
  status text not null default 'open' check (status in ('open', 'answered', 'accepted', 'declined', 'expired')),
  items jsonb not null,
  estimated_total_cents integer not null,
  savings_cents integer not null,
  notes text,
  response_message text,
  offered_total_cents integer,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Proposta de fornecimento (cadastro do produtor em 3 etapas).
create table supplier_proposals (
  id serial primary key,
  protocol text not null unique
    default ('EDS-' || to_char(now(), 'YYYY') || '-' || nextval('proposal_protocol_seq')::text),
  edit_token text not null unique,          -- permite retomar o rascunho sem login
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected')),
  current_step integer not null default 1 check (current_step between 1 and 3),
  -- Etapa 1: dados básicos
  responsible_name text,
  property_name text,
  city text,
  state text,
  email text,
  phone text,
  -- Etapa 2: produto e volume mensal
  main_product_type text,
  milk_used text,
  average_cure text,
  monthly_volume_kg integer,
  sale_format text,
  pickup_frequency text,
  -- Etapa 3: selos e certificações
  certifications text[] not null default '{}',
  review_notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proposal_attachments (
  id serial primary key,
  proposal_id integer not null references supplier_proposals(id) on delete cascade,
  original_name text not null,
  stored_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create table contact_messages (
  id serial primary key,
  topic text not null check (topic in ('general', 'wholesale', 'partnership', 'order')),
  name text not null,
  email text not null,
  phone text,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Números institucionais que não saem do banco (avaliação média, prazo de pagamento…).
create table site_settings (
  key text primary key,
  value jsonb not null
);

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'business_accounts', 'producers', 'categories', 'products', 'price_tiers', 'lots',
    'favorites', 'carts', 'cart_items', 'delivery_regions', 'orders', 'order_items', 'order_events',
    'quote_requests', 'supplier_proposals', 'proposal_attachments', 'contact_messages', 'site_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
