-- Bucket público para as fotos dos produtos (Supabase Storage).
-- Leitura é pública pela URL; envio só pela API com a chave secreta (ignora RLS), então não há políticas de escrita.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
