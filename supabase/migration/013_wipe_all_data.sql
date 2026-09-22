-- ============================================================================
-- 013_wipe_all_data.sql
-- Hapus SEMUA data operasional (reset toko ke kosong).
-- Dijalankan bila ingin mengosongkan database tanpa drop schema.
--
-- Urutan TRUNCATE penting karena FK; CASCADE mengurus sisanya.
-- - profiles & auth.users TIDAK dihapus (agar login tetap bisa).
-- - storage.objects untuk bucket product-images & documents ikut dibersihkan.
-- ============================================================================

-- ─── Hapus data operasional (CASCADE agar FK tidak menghalangi) ─────────────
truncate table
  public.order_revision_items,
  public.order_revisions,
  public.order_items,
  public.surat_jalans,
  public.documents,
  public.stock_movements,
  public.product_prices,
  public.orders,
  public.customers,
  public.products,
  public.categories,
  public.agent_approvals
restart identity cascade;

-- Settings dikosongkan juga (opsional: biarkan kosong agar toko mulai bersih).
-- Hapus baris ini jika ingin mempertahankan pengaturan toko.
truncate table public.settings restart identity cascade;

-- ─── Bersihkan file di Storage (jika ada) ──────────────────────────────────
-- Hapus objek produk & dokumen yang sudah tidak punya baris induk.
delete from storage.objects
where bucket_id in ('product-images', 'documents');
