-- Unidades de lotes vencidos continuam no físico (até alguém registrar a perda), mas não podem ser vendidas:
-- disponível = físico − vencido − reservado. A coluna "expired" entra no fim para manter a view compatível.
create or replace view product_stock with (security_invoker = true) as
select
  p.id as product_id,
  p.stock_units as on_hand,
  coalesce(r.units, 0)::int as reserved,
  (p.stock_units - coalesce(e.units, 0) - coalesce(r.units, 0))::int as available,
  coalesce(e.units, 0)::int as expired
from products p
left join (
  select i.product_id, sum(i.units)::int as units
  from order_items i join orders o on o.id = i.order_id
  where o.status in ('pending', 'confirmed', 'preparing')
  group by i.product_id
) r on r.product_id = p.id
left join (
  select product_id, sum(quantity)::int as units
  from stock_batches
  where quantity > 0 and expires_at <= now()
  group by product_id
) e on e.product_id = p.id;
