# Migrasi Cloudflare — Alfan Media

Stack aplikasi sekarang: React 19 + Vite + React Router; API Hono di Cloudflare Workers; Cloudflare D1; Cloudflare R2; Better Auth dengan sesi cookie HttpOnly. Next.js tidak lagi menjadi dependency atau runtime aplikasi. Paket Supabase hanya tersisa sebagai tipe TypeScript untuk kontrak sementara dan test lama, di devDependencies. Semua akses runtime memakai API Worker yang sama origin.

Alamat produksi: https://alfanmedia.my.id (custom domain Workers). Alamat `workers.dev` lama tetap aktif dan diizinkan untuk login; domain Vercel lama mengarahkan ke alamat produksi.

## Data produksi

Database tujuan `tokobuku-production` dibuat di APAC. Bucket: `tokobuku-files`. Sumber Supabase tidak dihapus atau diubah. Domain deployment lama belum dialihkan.

Snapshot awal: `migration-data/2026-11-04T09-49-50.675Z/`. Direktori ini diabaikan Git karena memuat data privat, konfigurasi provider AI, dan materi aktivasi akun. Jangan mengunggah direktori ini ke repository atau direktori static assets.

Hasil impor: 1 profil, 18 kategori, 21 produk, 21 tier harga, 2 pesanan, 6 item pesanan, 2 surat jalan, 27 pergerakan stok, 1 provider AI, 1 konfigurasi AI; seluruh 16 tabel dipertahankan, termasuk tabel yang kosong. Sebanyak 31 file disalin ke R2 dengan key yang mempertahankan nama bucket sumber.

`d1-remote-verification.json` membuktikan setiap nilai baris cocok, foreign key valid, saldo stok sama dengan ledger, dan ID akun autentikasi dipertahankan. `production-smoke.json` memuat hasil uji deployment dan checksum seluruh objek R2.

Supabase Admin API tidak mengekspor hash password. Akun Better Auth memakai ID pengguna lama; aktivasi dilakukan melalui tautan reset sekali pakai, bukan mengganti ID atau membuat pengguna baru. Tautan privat ada di `production-activation.md` di direktori snapshot dan berlaku 24 jam sejak dibuat. Buat password minimal 12 karakter. Tautan aktivasi produksi tidak dipakai untuk pengujian.

Email pemulihan otomatis membutuhkan `RESEND_API_KEY` dan `EMAIL_FROM` dari sender yang terverifikasi. Aktivasi awal menggunakan file privat dan tidak bergantung pada email. Jika email belum dikonfigurasi, tombol lupa password belum bisa mengirim email. Untuk penerbitan ulang aktivasi, jalankan `create-activation.mjs`, lalu terapkan SQL yang dihasilkan hanya ke database tujuan yang benar.

## Pengembangan

```powershell
npm install
node scripts/setup-local.mjs
npm run db:migrate:local
npm run dev
```

`setup-local.mjs` menghasilkan secret acak di `.dev.vars`, tanpa mencetaknya. Lingkungan lokal memakai `http://localhost:3000`. Konfigurasi secret produksi disimpan pada Workers dan terpisah dari `.dev.vars`.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Build menghasilkan asset di `dist/client/` dan Worker di `dist/tokobuku_alfan_media/`. Wrangler memakai konfigurasi hasil build dari plugin Cloudflare.

```powershell
npm run cf:login
npm run deploy
```

## Transaksi dan otorisasi

Pengganti RPC PostgreSQL berada di `worker/rpc.ts`. D1 `batch()` menggabungkan perubahan terkait menjadi satu transaksi. Trigger SQLite mempertahankan ledger, menolak stok negatif, dan memproses perubahan status. Invoice dialokasikan dalam statement insert yang sama; pemanggilan nomor invoice dari UI hanya preview. Checkout dan pembatalan berulang tidak menggandakan pergerakan stok.

Worker memvalidasi sesi Better Auth, mengambil peran pengguna dari profil D1, dan membatasi akses tabel/kolom. Browser tidak dapat membaca tabel provider AI atau persetujuan agent melalui API data umum. Pembacaan konfigurasi AI untuk agent tetap terjadi di server dan kunci tidak dikirim dalam respons UI. Persetujuan agent memakai perbandingan status atomik sehingga dua permintaan tidak bisa mengonsumsi persetujuan yang sama.

Tampilan asisten/login/pengaturan tidak memuat keseluruhan data toko saat dibuka. Halaman operasional mengambil snapshot lengkap melalui satu permintaan yang konsisten ke D1. Halaman, shell aplikasi, pemindai barcode, dan chat dibagi ke modul terpisah oleh Vite. Snapshot lengkap mempertahankan laporan dan riwayat yang ada; untuk skala data yang jauh lebih besar, laporan dan tabel perlu dipindahkan ke endpoint agregasi/paginasi per halaman. Belum ada benchmark sebelum/sesudah yang dapat membuktikan persentase peningkatan kecepatan.

## Prosedur migrasi ulang

Pause transaksi pada aplikasi sumber sebelum cutover final. Jangan gunakan dua aplikasi untuk menulis transaksi toko secara bersamaan. Jika sumber berubah setelah snapshot, lakukan ekspor dan rekonsiliasi lagi; jangan mengimpor ulang file lama ke D1 yang sudah berisi transaksi baru.

```powershell
node scripts/export-supabase.mjs
node scripts/prepare-d1-import.mjs migration-data/<snapshot>
```

Export membaca sumber menggunakan `.env.local`, menyertakan pengguna dan storage, lalu membaca ulang tabel untuk mendeteksi perubahan selama ekspor. Prepare memeriksa checksum snapshot, skema kolom, semua foreign key, jumlah baris dan saldo stok di SQLite sebelum menulis `import.sql`. File impor memiliki guard yang menolak tujuan yang sudah berisi data. Script sumber tidak pernah menjalankan file `013_wipe_all_data.sql`.

Setelah menyediakan D1 dan R2 baru serta memeriksa tujuan pada `wrangler.jsonc`:

```powershell
npm run db:migrate:remote
npx wrangler d1 execute DB --remote --file=migration-data/<snapshot>/import.sql
node scripts/upload-r2.mjs migration-data/<snapshot> --remote
node scripts/verify-d1.mjs migration-data/<snapshot> --remote
node scripts/verify-source.mjs migration-data/<snapshot>
```

Verifikasi terakhir adalah pengecekan titik waktu; pastikan tidak ada penulisan sumber antara pengecekan dan perpindahan pengguna. Saat berpindah, gunakan hanya aplikasi tujuan. Pertahankan sumber sebagai cadangan sampai transaksi dan pemulihan telah diperiksa. Rollback setelah ada transaksi baru di D1 memerlukan rekonsiliasi transaksi tersebut, bukan sekadar mengganti alamat aplikasi.

## Uji yang tersedia

Test Vitest lama tetap berjalan. Test D1 memakai schema dan trigger SQLite sebenarnya untuk memeriksa rollback penuh, ledger checkout/pembatalan, invoice, pembaruan harga, izin query, injeksi identifier SQL, dan perlombaan konsumsi persetujuan.

Pemeriksaan akhir: 181 test pada 16 file lulus, lint lulus, typecheck lulus, build dan deployment berhasil. `scripts/smoke-production-auth.mjs` juga memverifikasi aktivasi, hashing password, login, sesi, pembatasan staff/admin, penolakan replay token, dan logout pada deployment Cloudflare menggunakan akun uji sementara yang dihapus setelah pengujian. Akun asli dan tautan aktivasi aslinya tidak diubah.

`scripts/smoke-local.mjs` memeriksa aktivasi, penolakan replay token, login, akses data dan masking secret pada runtime Workers lokal. `scripts/smoke-concurrency.mjs` menguji checkout bersamaan lewat API Workers lokal. `scripts/smoke-production.mjs` membuat sesi verifikasi sementara, memeriksa API deployment, routing SPA, dan checksum seluruh objek R2, kemudian menghapus sesi itu. Script ini tidak menggunakan tautan aktivasi pengguna. Pengujian produksi tersebut tidak mencakup inspeksi visual browser atau pencetakan fisik.
