-- ============================================================================
-- 006_storage.sql
-- Setup Supabase Storage buckets untuk Tokobuku LKS.
-- Jalankan SETELAH 003_rls.sql.
-- ============================================================================

-- ─── Bucket: product-images (gambar sampul produk) ───────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,                          -- boleh diakses publik (untuk ditampilkan di katalog)
  5 * 1024 * 1024,               -- max 5MB per file
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Hapus policy lama (jika ada) supaya idempotent
drop policy if exists "product_images_read_public" on storage.objects;
drop policy if exists "product_images_write_authenticated" on storage.objects;
drop policy if exists "product_images_update_authenticated" on storage.objects;
drop policy if exists "product_images_delete_authenticated" on storage.objects;

-- Semua orang boleh membaca (publik)
create policy "product_images_read_public"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

-- User terautentikasi boleh upload/update/delete
create policy "product_images_write_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');

-- ─── Bucket: documents (PDF nota / surat jalan yang diarsipkan) ──────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                         -- privat, hanya user terautentikasi
  10 * 1024 * 1024,              -- max 10MB per file
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

drop policy if exists "documents_read_authenticated"   on storage.objects;
drop policy if exists "documents_write_authenticated"  on storage.objects;
drop policy if exists "documents_update_authenticated" on storage.objects;
drop policy if exists "documents_delete_authenticated" on storage.objects;

create policy "documents_read_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

create policy "documents_write_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "documents_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

create policy "documents_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
