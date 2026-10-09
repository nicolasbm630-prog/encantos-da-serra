-- Gestão de estoque: físico x reservado x disponível, com histórico de movimentações.
--
-- Até aqui o checkout baixava products.stock_units direto. A partir desta migration:
--   * stock_units = estoque FÍSICO (o que está na câmara fria);
--   * pedidos abertos (pending/confirmed/preparing) só RESERVAM unidades;
--   * a baixa física acontece na expedição (status in_transit).

alter table products
  add column min_stock_units integer not null default 0 check (min_stock_units >= 0);

alter table orders add column shipped_at timestamptz;

create table stock_movements (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  kind text not null check (kind in ('entrada', 'saida', 'perda', 'contagem', 'expedicao', 'devolucao')),
  quantity integer not null,          -- variação em unidades (+ entra, − sai)
  stock_after integer not null,       -- estoque físico depois do movimento
  note text,
  order_id integer references orders(id) on delete set null,
  user_id integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on stock_movements (product_id, created_at desc);
alter table stock_movements enable row level security;

-- Converte pedidos abertos para o modelo de reserva: devolve ao físico o que o checkout antigo já tinha baixado.
update products p set stock_units = p.stock_units + r.units
from (
  select i.product_id, sum(i.units)::int as units
  from order_items i join orders o on o.id = i.order_id
  where o.status in ('pending', 'confirmed', 'preparing')
  group by i.product_id
) r
where r.product_id = p.id;

update orders set shipped_at = updated_at where status in ('in_transit', 'delivered');

-- Mínimo padrão: 3 caixas.
update products set min_stock_units = box_size * 3;

-- Visão única de estoque por produto. security_invoker respeita o RLS de quem consulta.
create view product_stock with (security_invoker = true) as
select
  p.id as product_id,
  p.stock_units as on_hand,
  coalesce(r.units, 0)::int as reserved,
  (p.stock_units - coalesce(r.units, 0))::int as available
from products p
left join (
  select i.product_id, sum(i.units)::int as units
  from order_items i join orders o on o.id = i.order_id
  where o.status in ('pending', 'confirmed', 'preparing')
  group by i.product_id
) r on r.product_id = p.id;
