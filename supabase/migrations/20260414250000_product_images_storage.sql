-- =============================================================
-- Txoko — Bucket publico para imagens de produto
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura publica (bucket publico ja cobre, mas explicitamos)
create policy "public read product images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

-- Upload: apenas owner/manager podem subir imagens
create policy "managers upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from restaurant_members
      where user_id = auth.uid()
        and role in ('owner','manager')
    )
  );

create policy "managers update product images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from restaurant_members
      where user_id = auth.uid()
        and role in ('owner','manager')
    )
  );

create policy "managers delete product images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from restaurant_members
      where user_id = auth.uid()
        and role in ('owner','manager')
    )
  );
