-- ============================================================================
-- 002_indexes.sql
-- Index untuk performa query (pencarian, list, join).
-- Jalankan SETELAH 001_schema.sql.
-- ============================================================================

-- ─── Extensions (diperlukan SEBELUM index yang memakainya) ───────────────
-- pg_trgm menyediakan operator class gin_trgm_ops untuk pencarian nama produk
-- yang mirip (mis. "matematika" ~ "matematik").
create extension if not exists pg_trgm;

-- ─── Categories ───────────────────────────────────────────────────────────
create index if not exists idx_categories_name     on public.categories (name);
create index if not exists idx_categories_level    on public.categories (level);

-- ─── Products ─────────────────────────────────────────────────────────────
create index if not exists idx_products_category_id on public.products (category_id);
create index if not exists idx_products_barcode     on public.products (barcode);
create index if not exists idx_products_name_trgm   on public.products using gin (name gin_trgm_ops);
create index if not exists idx_products_low_stock   on public.products (stock) where stock <= 5;

-- ─── Product Prices ───────────────────────────────────────────────────────
create index if not exists idx_product_prices_product_id on public.product_prices (product_id);
create index if not exists idx_product_prices_tier        on public.product_prices (tier_name);

-- ─── Customers ────────────────────────────────────────────────────────────
create index if not exists idx_customers_name       on public.customers (name);
create index if not exists idx_customers_price_tier on public.customers (price_tier);

-- ─── Orders ───────────────────────────────────────────────────────────────
create index if not exists idx_orders_invoice_no     on public.orders (invoice_no);
create index if not exists idx_orders_status         on public.orders (status);
create index if not exists idx_orders_order_date     on public.orders (order_date desc);
create index if not exists idx_orders_customer_id    on public.orders (customer_id);
create index if not exists idx_orders_created_by     on public.orders (created_by);
create index if not exists idx_orders_status_date    on public.orders (status, order_date desc);

-- ─── Order Items ──────────────────────────────────────────────────────────
create index if not exists idx_order_items_order_id   on public.order_items (order_id);
create index if not exists idx_order_items_product_id on public.order_items (product_id);
create index if not exists idx_order_items_barcode    on public.order_items (product_barcode);

-- ─── Order Revisions ──────────────────────────────────────────────────────
create index if not exists idx_order_revisions_order_id on public.order_revisions (order_id);
create index if not exists idx_order_revisions_changed_by on public.order_revisions (changed_by);

-- ─── Surat Jalan ──────────────────────────────────────────────────────────
create index if not exists idx_surat_jalans_order_id on public.surat_jalans (order_id);
create index if not exists idx_surat_jalans_no       on public.surat_jalans (no);

-- ─── Stock Movements ──────────────────────────────────────────────────────
create index if not exists idx_stock_movements_product_id on public.stock_movements (product_id);
create index if not exists idx_stock_movements_type       on public.stock_movements (type);
create index if not exists idx_stock_movements_created_at  on public.stock_movements (created_at desc);
create index if not exists idx_stock_movements_product_date
  on public.stock_movements (product_id, created_at desc);

-- ─── Documents ────────────────────────────────────────────────────────────
create index if not exists idx_documents_order_id on public.documents (order_id);
create index if not exists idx_documents_type     on public.documents (type);

-- ─── Profiles ─────────────────────────────────────────────────────────────
create index if not exists idx_profiles_role on public.profiles (role);
