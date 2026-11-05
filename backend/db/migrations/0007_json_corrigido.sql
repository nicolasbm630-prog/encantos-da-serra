-- Corrige JSON gravado duas vezes: o código mandava JSON.stringify(...) para um parâmetro ::jsonb e o driver
-- serializava de novo, então endereço, configurações e itens de cotação viravam um texto dentro do jsonb.
-- O código agora grava com ::text::jsonb; aqui desembrulhamos o que já estava salvo.
update orders set address = (address #>> '{}')::jsonb where jsonb_typeof(address) = 'string';
update site_settings set value = (value #>> '{}')::jsonb where jsonb_typeof(value) = 'string';
update quote_requests set items = (items #>> '{}')::jsonb where jsonb_typeof(items) = 'string';
