-- Preços de varejo ajustados a referências de mercado pesquisadas em nov/2026 (marketplaces, varejo e empórios).
-- As faixas do atacado acompanham na mesma proporção, mantendo o desconto de cada faixa sobre o varejo.
-- Ricota fresca e queijo de cabra frescal ficam como estavam (sem referência de varejo confiável).
create temp table novos_precos (sku text primary key, cents integer not null) on commit drop;
insert into novos_precos values
  ('CAN-MC600', 5290),   -- canastra meia cura 600 g: R$ 57–99/kg online
  ('CAN-RC1K', 13990),   -- canastra curado premiado 1 kg: R$ 137–180
  ('TUL-180', 17990),    -- tulha 180 dias 1,2 kg: curados artesanais R$ 150–180/kg
  ('AZU-M480', 7190),    -- queijo azul 480 g: R$ 96/kg industrial, R$ 150/kg artesanal
  ('MIN-F500', 2690),    -- minas frescal 500 g: R$ 36–60/kg
  ('REQ-C500', 5990),    -- requeijão de corte 500 g: R$ 120–136/kg
  ('MAN-C200', 2790),    -- manteiga 200 g: artesanal ~R$ 138/kg
  ('DDL-C450', 3690),    -- doce de leite cremoso 450 g: 400 g por R$ 31,50–35,49
  ('DDL-B300', 1290),    -- doce de leite em barra 300 g: 400 g por R$ 11–16
  ('DDL-Z400', 4990);    -- doce de leite zero açúcar 400 g: R$ 46–60

update price_tiers t
set unit_price_cents = greatest(10, (round(t.unit_price_cents * n.cents::numeric / p.retail_price_cents / 10) * 10)::int)
from products p join novos_precos n on n.sku = p.sku
where t.product_id = p.id;

update products p set retail_price_cents = n.cents, updated_at = now()
from novos_precos n where p.sku = n.sku;
