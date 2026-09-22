-- ============================================================================
-- 012_profit_and_image.sql
-- Profit tracking + product cover image.
--
--   1. products.cost_price  — harga awal/modal per produk (bigint IDR).
--   2. products.image_path   — path file di storage bucket "product-images".
--   3. order_items.cost_price — SNAPSHOT modal produk saat pesanan dibuat,
--      supaya laba dihitung dari modal yang berlaku saat itu (bukan modal
--      terkini yang bisa berubah setelahnya).
--
-- Laba pesanan = (revenue bersih) - (jumlah modal terpakai).
--   revenue per item  = order_items.subtotal  (sudah termasuk diskon per item)
--   jumlah modal item = order_items.cost_price * order_items.quantity
--   laba bersih order = SUM(items.subtotal) - SUM(items.cost_price*qty)
--                       - orders.discount
-- ============================================================================

-- ─── products: harga awal (modal) & gambar sampul ─────────────────────────
alter table public.products
  add column if not exists cost_price bigint not null default 0
    check (cost_price >= 0);

alter table public.products
  add column if not exists image_path text;

comment on column public.products.cost_price is
  'Harga awal / modal per unit (IDR). Dipakai menghitung laba.';

comment on column public.products.image_path is
  'Path objek di bucket storage "product-images" (mis. products/<uuid>.png). NULL bila tanpa gambar.';

-- ─── order_items: snapshot modal saat penjualan ───────────────────────────
alter table public.order_items
  add column if not exists cost_price bigint not null default 0
    check (cost_price >= 0);

comment on column public.order_items.cost_price is
  'Snapshot products.cost_price pada saat item ditambahkan ke pesanan.';