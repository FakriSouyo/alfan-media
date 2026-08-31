-- ============================================================================
-- 001_schema.sql
-- Skema utama untuk aplikasi Tokobuku LKS
-- Jalankan file ini PERTAMA di Supabase SQL Editor.
-- ============================================================================

-- Ekstensi: gen_random_uuid() (sudah tersedia di Supabase, tapi tetap aman)
create extension if not exists "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────────────────────
do $$ begin
  create type category_level as enum ('SD', 'SMP', 'SMA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type semester as enum ('Ganjil', 'Genap');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('DRAFT', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('INITIAL', 'SALE', 'ADJUSTMENT', 'RETURN', 'CANCELLED_ORDER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_type as enum ('NOTA', 'SURAT_JALAN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum ('admin', 'staff');
exception when duplicate_object then null; end $$;

-- ─── PROFILES (pengguna aplikasi, 1:1 dengan auth.users) ────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  role          app_role not null default 'staff',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Profil pengguna aplikasi. 1:1 dengan auth.users (Supabase Auth).';

-- ─── CATEGORIES ────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  level         category_level,                                -- nullable: kategori umum tidak punya level
  description   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.categories is 'Kategori buku (Matematika, Novel, dll).';
comment on column public.categories.level is 'Jenjang pendidikan: SD/SMP/SMA. NULL untuk kategori umum.';

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category_id     uuid references public.categories(id) on delete set null,
  barcode         text not null,
  description     text not null default '',
  published_year  int,
  semester        semester not null default 'Ganjil',
  stock           int not null default 0 check (stock >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.products is 'Buku/produk yang dijual.';

-- ─── PRODUCT PRICES (tier harga per produk) ────────────────────────────────
create table if not exists public.product_prices (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  tier_name     text not null,                       -- Normal / Member / Guru / Sekolah / Distributor
  price         bigint not null check (price >= 0),  -- dalam IDR (integer)
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, tier_name)
);

comment on table public.product_prices is
  'Harga bertingkat per produk. Tiap produk punya minimal satu tier "Normal".';

-- Hanya boleh ada satu default price per product
create unique index if not exists uq_product_default_price
  on public.product_prices (product_id)
  where is_default;

-- ─── CUSTOMERS ─────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price_tier    text not null default 'Normal',  -- tier harga yang berlaku untuk pelanggan ini
  phone         text,
  address       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.customers is 'Pelanggan (sekolah, toko, guru, walk-in).';

-- ─── ORDERS ────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null unique,                  -- mis. INV-001, sama dengan referensi lama
  order_date    date not null default current_date,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text not null,                        -- snapshot nama pelanggan (untuk walk-in)
  subtotal      bigint not null default 0,
  discount      bigint not null default 0,
  total         bigint not null default 0,
  status        order_status not null default 'DRAFT',
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (total >= 0)
);

comment on table public.orders is 'Pesanan / invoice.';
comment on column public.orders.invoice_no is 'Nomor invoice yang ditampilkan ke pengguna (INV-001, dst).';

-- ─── ORDER ITEMS ───────────────────────────────────────────────────────────
create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,                    -- snapshot nama produk
  product_barcode   text not null,                    -- snapshot barcode
  quantity          int  not null check (quantity > 0),
  unit_price        bigint not null check (unit_price >= 0),
  price_tier        text not null default 'Normal',
  custom_price      bigint,                           -- override harga manual oleh kasir
  discount_percent  numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  subtotal          bigint not null check (subtotal >= 0),
  created_at        timestamptz not null default now()
);

comment on table public.order_items is
  'Item-item dalam pesanan. Disimpan sebagai snapshot agar histori tidak berubah saat produk/master diedit.';

-- ─── ORDER REVISIONS (audit trail perubahan pesanan) ───────────────────────
create table if not exists public.order_revisions (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  revision_number  int  not null,
  subtotal         bigint not null default 0,
  discount         bigint not null default 0,
  total            bigint not null default 0,
  reason           text not null default '',
  changed_by       uuid references public.profiles(id) on delete set null,
  changed_at       timestamptz not null default now(),
  unique (order_id, revision_number)
);

comment on table public.order_revisions is 'Riwayat revisi pesanan (siapa yang mengubah, kapan, kenapa).';

-- ─── ORDER REVISION ITEMS (snapshot item per revisi) ───────────────────────
create table if not exists public.order_revision_items (
  id                uuid primary key default gen_random_uuid(),
  revision_id       uuid not null references public.order_revisions(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,
  product_barcode   text not null,
  quantity          int  not null check (quantity > 0),
  unit_price        bigint not null check (unit_price >= 0),
  price_tier        text not null default 'Normal',
  custom_price      bigint,
  discount_percent  numeric(5,2) not null default 0,
  subtotal          bigint not null check (subtotal >= 0)
);

-- ─── SURAT JALAN (1:1 dengan order, opsional) ──────────────────────────────
create table if not exists public.surat_jalans (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  no              text not null,                       -- mis. SJ-INV-001
  tanggal         date not null,
  pengirim        text not null default '',
  penerima        text not null default '',
  estimasi        text not null default '',
  nama_pengirim   text not null default '',
  kendaraan       text not null default '',
  catatan         text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.surat_jalans is 'Surat izin jalan yang terkait satu pesanan.';

-- ─── STOCK MOVEMENTS ───────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  type          movement_type not null,
  quantity      int not null,                          -- positif = masuk, negatif = keluar
  reference     text not null default '',              -- order id atau catatan adjustment
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (quantity <> 0)
);

comment on table public.stock_movements is
  'Log pergerakan stok. Sumber kebenaran perubahan stok; products.stock = SUM(movements).';

-- ─── DOCUMENTS (nota, surat jalan yang sudah dicetak) ─────────────────────
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  type          document_type not null,
  number        text not null,
  created_at    timestamptz not null default now()
);

comment on table public.documents is 'Dokumen cetak (nota / surat jalan) per pesanan.';

-- ─── SETTINGS (pengaturan toko, key-value sederhana) ──────────────────────
create table if not exists public.settings (
  key           text primary key,
  value         jsonb not null,
  updated_at    timestamptz not null default now()
);

comment on table public.settings is 'Pengaturan toko dalam format key-value JSON.';
