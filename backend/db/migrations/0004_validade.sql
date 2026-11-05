-- Validade por lote de entrada.
--
-- Cada entrada no estoque vira um lote (stock_batches) que vence em received_at + products.shelf_life_days.
-- Saídas, perdas e expedições consomem primeiro o lote que vence antes (FEFO); stock_batch_moves guarda
-- de qual lote saiu cada unidade, para o cancelamento de um pedido expedido devolver aos mesmos lotes.
-- products.stock_units continua sendo o físico total; a soma dos lotes acompanha esse número.

alter table products add column shelf_life_days integer check (shelf_life_days > 0);

-- Validade padrão (produto fechado, refrigerado de 2 a 8 °C), contada a partir da entrada no estoque.
update products set shelf_life_days = v.days
from (values
  ('MIN-F500', 15),   -- minas frescal: 10 a 20 dias
  ('RIC-F400', 10),   -- ricota fresca: alta umidade, estimativa conservadora
  ('CAB-F250', 14),   -- cabra frescal: análises em conformidade aos 14 dias (Embrapa)
  ('CAN-MC600', 60),  -- canastra meia cura: estimativa
  ('CAN-RC1K', 90),   -- canastra curado: estimativa
  ('TUL-180', 180),   -- tulha, massa dura de longa cura: estimativa
  ('AZU-M480', 30),   -- queijo azul: 3 a 4 semanas
  ('MAN-C200', 150),  -- manteiga: 150 dias
  ('REQ-C500', 30),   -- requeijão de corte: estimativa
  ('DDL-C450', 180),  -- doce de leite pastoso: 160 a 180 dias
  ('DDL-B300', 365),  -- doce de leite em tablete: 12 meses
  ('DDL-Z400', 120)   -- zero açúcar: sem açúcar para conservar, estimativa conservadora
) as v(sku, days)
where products.sku = v.sku;

create table stock_batches (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  received_at timestamptz not null,
  expires_at timestamptz,            -- null quando o produto não tem validade definida
  initial integer not null check (initial > 0),
  quantity integer not null check (quantity >= 0),
  movement_id integer references stock_movements(id) on delete set null
);
create index stock_batches_product_idx on stock_batches (product_id, expires_at) where quantity > 0;
alter table stock_batches enable row level security;

create table stock_batch_moves (
  id serial primary key,
  movement_id integer not null references stock_movements(id) on delete cascade,
  batch_id integer not null references stock_batches(id) on delete cascade,
  quantity integer not null           -- negativo = saiu do lote; positivo = voltou ao lote
);
create index stock_batch_moves_movement_idx on stock_batch_moves (movement_id);
alter table stock_batch_moves enable row level security;

-- Reconstrói os lotes repassando o histórico de movimentações em ordem e depois acerta a diferença
-- com o físico atual (estoque sem histórico entra como lote na data de cadastro do produto).
create or replace function rebuild_stock_batches() returns void language plpgsql as $$
declare
  m record; b record; p record;
  need integer; take integer; diff integer;
begin
  delete from stock_batch_moves;
  delete from stock_batches;

  for m in select sm.*, pr.shelf_life_days from stock_movements sm join products pr on pr.id = sm.product_id order by sm.created_at, sm.id loop
    if m.quantity > 0 then
      insert into stock_batches (product_id, received_at, expires_at, initial, quantity, movement_id)
      values (m.product_id, m.created_at, m.created_at + make_interval(days => m.shelf_life_days), m.quantity, m.quantity, m.id);
    elsif m.quantity < 0 then
      need := -m.quantity;
      for b in select id, quantity from stock_batches where product_id = m.product_id and quantity > 0
               order by expires_at nulls last, received_at, id loop
        exit when need = 0;
        take := least(need, b.quantity);
        update stock_batches set quantity = quantity - take where id = b.id;
        insert into stock_batch_moves (movement_id, batch_id, quantity) values (m.id, b.id, -take);
        need := need - take;
      end loop;
    end if;
  end loop;

  for p in select pr.id, pr.stock_units, pr.created_at, pr.shelf_life_days,
                  coalesce((select sum(quantity) from stock_batches sb where sb.product_id = pr.id), 0)::int as in_batches
           from products pr loop
    diff := p.stock_units - p.in_batches;
    if diff > 0 then
      insert into stock_batches (product_id, received_at, expires_at, initial, quantity)
      values (p.id, p.created_at, p.created_at + make_interval(days => p.shelf_life_days), diff, diff);
    elsif diff < 0 then
      need := -diff;
      for b in select id, quantity from stock_batches where product_id = p.id and quantity > 0
               order by expires_at nulls last, received_at, id loop
        exit when need = 0;
        take := least(need, b.quantity);
        update stock_batches set quantity = quantity - take where id = b.id;
        need := need - take;
      end loop;
    end if;
  end loop;
end $$;

select rebuild_stock_batches();
