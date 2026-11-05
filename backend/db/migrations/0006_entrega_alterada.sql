-- Quando o cliente (ou a equipe) muda endereço ou data de entrega de um pedido ainda não expedido.
alter table orders add column delivery_changed_at timestamptz;
