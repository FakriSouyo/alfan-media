-- ============================================================================
-- 003_rls.sql
-- Row Level Security policies untuk Tokobuku LKS.
-- Jalankan SETELAH 001_schema.sql dan 002_indexes.sql.
--
-- Strategi:
--   - Semua user terautentikasi (admin & staff) boleh membaca & menulis data
--     operasional (kategori, produk, pesanan, dll).
--   - Hanya ADMIN yang boleh mengelola profiles / users lain.
--   - profiles: user bisa membaca profilnya sendiri; admin bisa membaca semua.
-- ============================================================================

-- ─── Helper: cek apakah user adalah admin ─────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ─── PROFILES ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ─── CATEGORIES ───────────────────────────────────────────────────────────
alter table public.categories enable row level security;

drop policy if exists "categories_all_authenticated" on public.categories;
create policy "categories_all_authenticated"
  on public.categories for all
  to authenticated
  using (true) with check (true);

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────
alter table public.products enable row level security;

drop policy if exists "products_all_authenticated" on public.products;
create policy "products_all_authenticated"
  on public.products for all
  to authenticated
  using (true) with check (true);

-- ─── PRODUCT PRICES ───────────────────────────────────────────────────────
alter table public.product_prices enable row level security;

drop policy if exists "product_prices_all_authenticated" on public.product_prices;
create policy "product_prices_all_authenticated"
  on public.product_prices for all
  to authenticated
  using (true) with check (true);

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────
alter table public.customers enable row level security;

drop policy if exists "customers_all_authenticated" on public.customers;
create policy "customers_all_authenticated"
  on public.customers for all
  to authenticated
  using (true) with check (true);

-- ─── ORDERS ───────────────────────────────────────────────────────────────
alter table public.orders enable row level security;

drop policy if exists "orders_all_authenticated" on public.orders;
create policy "orders_all_authenticated"
  on public.orders for all
  to authenticated
  using (true) with check (true);

-- ─── ORDER ITEMS ──────────────────────────────────────────────────────────
alter table public.order_items enable row level security;

drop policy if exists "order_items_all_authenticated" on public.order_items;
create policy "order_items_all_authenticated"
  on public.order_items for all
  to authenticated
  using (true) with check (true);

-- ─── ORDER REVISIONS ──────────────────────────────────────────────────────
alter table public.order_revisions enable row level security;

drop policy if exists "order_revisions_all_authenticated" on public.order_revisions;
create policy "order_revisions_all_authenticated"
  on public.order_revisions for all
  to authenticated
  using (true) with check (true);

alter table public.order_revision_items enable row level security;

drop policy if exists "order_revision_items_all_authenticated" on public.order_revision_items;
create policy "order_revision_items_all_authenticated"
  on public.order_revision_items for all
  to authenticated
  using (true) with check (true);

-- ─── SURAT JALAN ──────────────────────────────────────────────────────────
alter table public.surat_jalans enable row level security;

drop policy if exists "surat_jalans_all_authenticated" on public.surat_jalans;
create policy "surat_jalans_all_authenticated"
  on public.surat_jalans for all
  to authenticated
  using (true) with check (true);

-- ─── STOCK MOVEMENTS ──────────────────────────────────────────────────────
alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements_all_authenticated" on public.stock_movements;
create policy "stock_movements_all_authenticated"
  on public.stock_movements for all
  to authenticated
  using (true) with check (true);

-- ─── DOCUMENTS ────────────────────────────────────────────────────────────
alter table public.documents enable row level security;

drop policy if exists "documents_all_authenticated" on public.documents;
create policy "documents_all_authenticated"
  on public.documents for all
  to authenticated
  using (true) with check (true);

-- ─── SETTINGS ─────────────────────────────────────────────────────────────
alter table public.settings enable row level security;

drop policy if exists "settings_all_authenticated" on public.settings;
create policy "settings_all_authenticated"
  on public.settings for all
  to authenticated
  using (true) with check (true);

-- ─── AUTO-CREATE PROFILE ON SIGNUP ────────────────────────────────────────
-- Trigger supaya saat ada user baru daftar di Supabase Auth, profil otomatis
-- dibuat di public.profiles dengan role default 'staff'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
