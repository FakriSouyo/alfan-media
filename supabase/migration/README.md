# Supabase Migration — Tokobuku LKS

Folder ini berisi kumpulan query SQL untuk membuat database Supabase yang siap
dipakai oleh aplikasi **Tokobuku LKS** (POS / inventory buku).

> Semua file di bawah ini **WAJIB dijalankan berurutan** di **Supabase SQL
> Editor** (https://supabase.com/dashboard → Project Anda → SQL Editor).

---

## 📋 Daftar File (jalankan sesuai urutan)

| # | File | Apa yang dibuat |
|---|---|---|
| 1 | `001_schema.sql` | Tabel, enum, dan relasi (Foreign Key) |
| 2 | `002_indexes.sql` | Index untuk performa query |
| 3 | `003_rls.sql` | Row Level Security + trigger auto-profile + `is_admin()` |
| 4 | `004_triggers.sql` | Trigger `updated_at`, sinkron stok, helper invoice |
| 5 | `005_seed.sql` | Data awal yang mencerminkan `dummy-data.ts` |
| 6 | `006_storage.sql` | Storage bucket (gambar produk & dokumen) |
| 7 | `007_category_level_to_text.sql` | `categories.level` → text bebas (label seperti "SD I") |
| 8 | `008_agent_approvals.sql` | Tabel `agent_approvals` (persetujuan operasi sensitif AI agent) |
| 9 | `009_ai_settings.sql` | Tabel `ai_providers` + `ai_settings` (provider & model AI, admin-only) |
| 10 | `010_ai_provider_enabled.sql` | `ai_providers.enabled` (nonaktifkan provider) + `api_key` boleh NULL |

---

## 🚀 Cara Menjalankan

### 1. Buat Project Supabase

1. Buka https://supabase.com/dashboard
2. Klik **"New Project"**, isi nama, password DB, region
3. Tunggu project selesai di-provision (~1-2 menit)

### 2. Jalankan Migration

Di dashboard Supabase:

1. Klik menu **SQL Editor** (ikon `</>` di sidebar kiri)
2. Klik **"New query"**
3. Buka file `001_schema.sql`, **copy seluruh isinya**, paste ke editor
4. Klik **"Run"** (atau tekan `Ctrl+Enter`) — tunggu sampai "Success"
5. Ulangi untuk file `002_indexes.sql`, `003_rls.sql`, `004_triggers.sql`
6. (Opsional) Jalankan `005_seed.sql` jika ingin ada data contoh
7. (Opsional) Jalankan `006_storage.sql` untuk setup storage bucket
8. (Opsional, untuk AI Assistant) Jalankan `007_category_level_to_text.sql`,
   `008_agent_approvals.sql`, dan `009_ai_settings.sql`

> **Tips:** setiap file sudah `idempotent` (`if not exists`, `drop policy if
> exists`) jadi aman dijalankan berulang.

### 3. Ambil API Keys

1. Di dashboard, klik **Settings → API**
2. Copy:
   - **Project URL** → ini `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → ini `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → ini `SUPABASE_SERVICE_ROLE_KEY` (JANGAN dipakai di client!)

### 4. Set Environment Variables

Edit file `.env.local` di root project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...   # server-only
```

### 5. Buat User Admin Pertama

Karena RLS butuh user terautentikasi, buat dulu akun via Supabase:

1. Dashboard → **Authentication → Users → Add user → Create new user**
2. Masukkan email & password, klik **Create user**
3. Setelah user dibuat, jalankan query ini di SQL Editor untuk promote ke admin:

```sql
update public.profiles
set role = 'admin', name = 'Admin Tokobuku'
where email = 'admin@tokobuku.com';
```

(Trigger `on_auth_user_created` di `003_rls.sql` akan otomatis membuat
profile baru dengan role `staff` saat signup — query di atas hanya untuk
mengubahnya jadi `admin`.)

---

## 🗄️ Struktur Tabel

```
auth.users ─┐
            ├── profiles          (1:1, role admin/staff)
            │
            ├── categories        (UUID, level SD/SMP/SMA nullable)
            │     └── products    (1:N, FK ke categories)
            │           ├── product_prices  (1:N, tier harga)
            │           └── stock_movements (1:N, log pergerakan stok)
            │
            ├── customers         (UUID, price_tier teks)
            │     └── orders      (1:N, FK ke customers nullable)
            │           ├── order_items          (1:N)
            │           ├── order_revisions      (1:N)
            │           │     └── order_revision_items (1:N)
            │           ├── surat_jalans         (1:1, optional)
            │           └── documents            (1:N, nota/surat_jalan)
            │
            └── settings          (key-value JSONB)
```

### Tabel Utama

| Tabel | Deskripsi |
|---|---|
| `profiles` | Profil user aplikasi, 1:1 dengan `auth.users` |
| `categories` | Kategori buku (Matematika, Novel, dll) |
| `products` | Buku/produk |
| `product_prices` | Harga per tier (Normal/Member/Guru/Sekolah) |
| `customers` | Pelanggan (sekolah, toko, guru, walk-in) |
| `orders` | Pesanan / invoice |
| `order_items` | Item-item pesanan (snapshot) |
| `order_revisions` | Riwayat revisi pesanan |
| `order_revision_items` | Snapshot item per revisi |
| `surat_jalans` | Surat izin jalan (1:1 dengan order) |
| `stock_movements` | Log pergerakan stok (sumber kebenaran `products.stock`) |
| `documents` | Dokumen cetak (nota / surat jalan) |
| `settings` | Pengaturan toko (key-value JSONB) |
| `agent_approvals` | Persetujuan operasi sensitif AI agent (per user, TTL 15 menit) |
| `ai_providers` | Provider AI custom (gateway OpenAI-compatible) — admin-only |
| `ai_settings` | Provider + model AI yang aktif (baris tunggal, global) — admin-only |

---

## 🔐 Row Level Security (RLS)

Semua tabel sudah di-enable RLS dengan kebijakan:

- **Admin & Staff** (user terautentikasi) → boleh baca/tulis semua data operasional
- **Hanya Admin** → boleh mengelola `profiles` (tambah/edit/hapus user lain)
- **Public (anon)** → hanya boleh baca gambar produk di bucket `product-images`

Fungsi helper: `public.is_admin()` — return `true` jika user yang sedang login
adalah admin. Dipakai di policy `profiles_*`.

---

## ⚙️ Trigger & Fungsi Bawaan

| Nama | Kapan dijalankan | Fungsi |
|---|---|---|
| `set_updated_at()` | BEFORE UPDATE | Otomatis set kolom `updated_at = now()` |
| `sync_product_stock()` | AFTER INSERT/UPDATE/DELETE di `stock_movements` | Hitung ulang `products.stock` dari SUM movements |
| `handle_new_user()` | AFTER INSERT di `auth.users` | Auto-buat `profiles` dengan role `staff` |
| `next_invoice_no()` | Dipanggil manual | Generate nomor invoice berikutnya (`INV-001`, `INV-002`, …) |

---

## 🛠️ Query Helper yang Berguna

### Mendapatkan nomor invoice berikutnya

```sql
select public.next_invoice_no();
-- Returns: 'INV-007'
```

### Lihat produk dengan stok menipis (≤ 5)

```sql
select id, name, barcode, stock
from public.products
where stock <= 5
order by stock asc;
```

### Lihat total penjualan per hari (7 hari terakhir)

```sql
select
  order_date,
  count(*) as total_orders,
  sum(total) as revenue
from public.orders
where status in ('COMPLETED', 'CHECKED_OUT')
  and order_date >= current_date - interval '7 days'
group by order_date
order by order_date desc;
```

### Lihat top 10 produk paling laris

```sql
select
  p.name,
  sum(oi.quantity) as total_qty,
  sum(oi.subtotal) as total_revenue
from public.order_items oi
join public.products p on p.id = oi.product_id
join public.orders o on o.id = oi.order_id
where o.status in ('COMPLETED', 'CHECKED_OUT')
group by p.id, p.name
order by total_qty desc
limit 10;
```

### Stok terkini per produk (cross-check)

```sql
select
  p.id,
  p.name,
  p.stock as stock_di_tabel,
  coalesce(sum(sm.quantity), 0) as stock_dari_movements
from public.products p
left join public.stock_movements sm on sm.product_id = p.id
group by p.id, p.name, p.stock
order by p.name;
```

---

## 🧹 Reset Database (HATI-HATI!)

Jika ingin mengulang dari awal:

```sql
-- ⚠️ PERINTAH INI AKAN MENGHAPUS SEMUA DATA
truncate table
  public.order_revision_items,
  public.order_revisions,
  public.order_items,
  public.surat_jalans,
  public.documents,
  public.orders,
  public.stock_movements,
  public.product_prices,
  public.products,
  public.customers,
  public.categories,
  public.settings
restart identity cascade;
```

Lalu jalankan ulang `001_schema.sql` sampai `006_storage.sql` (dan `007`–`009`
jika fitur AI Assistant sudah dipakai — ketiganya hanya skema, tanpa data).

---

## 📦 Storage Buckets

| Bucket | Visibilitas | MIME types | Maks |
|---|---|---|---|
| `product-images` | Publik | png, jpeg, webp | 5MB |
| `documents` | Privat (auth) | pdf, png, jpeg | 10MB |

Path yang disarankan:
- `product-images/<product-id>/cover.jpg` — sampul produk
- `documents/<invoice-no>.pdf` — arsip nota/surat jalan

---

## ❓ Troubleshooting

**Q: Trigger `sync_product_stock` tidak update stok?**
Pastikan Anda insert ke `stock_movements` (bukan langsung update `products.stock`).
Selalu ubah stok lewat movements — itu satu-satunya sumber kebenaran.

**Q: Gagal insert order karena "duplicate key invoice_no"?**
Invoice harus unik. Gunakan `public.next_invoice_no()` untuk generate nomor
baru, atau tangkap error dan retry.

**Q: User baru tidak punya profile?**
Trigger `on_auth_user_created` seharusnya handle ini otomatis. Jika tidak
jalan, cek apakah Supabase Auth Anda dalam kondisi baik, lalu jalankan
manual:
```sql
insert into public.profiles (id, email, name, role)
select id, email, raw_user_meta_data->>'name', 'staff'
from auth.users
where id not in (select id from public.profiles);
```

**Q: Cara ganti role staff jadi admin?**
```sql
update public.profiles set role = 'admin' where email = 'email@user.com';
```

---

Setelah semua langkah di atas selesai, aplikasi Next.js Anda siap mengambil
data dari Supabase. Selamat bermigrasi! 🚀
