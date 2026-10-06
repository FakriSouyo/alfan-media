# Hasil Uji Fitur & Temuan Bug — Toko Buku Alfan Media

Tanggal: 2 Oktober 2026, sesi uji pukul 23.00–23.40 WITA. Aplikasi diuji langsung di
browser dengan akun admin (alfan@gmail.com), dev server di `localhost:3000`.

## Ringkasan

| Area fitur | Status | Catatan |
| --- | --- | --- |
| Login / logout / guard halaman | ✅ | validasi, kredensial salah, redirect setelah logout semua benar |
| Dashboard | ✅ | angka benar; 2 perhitungan tidak terpakai (lihat B16) |
| Produk: daftar & filter | ✅ | tabel, kategori, laba/pcs, stok benar |
| Produk: tambah | ✅ | validasi lengkap (termasuk peringatan jual < modal) |
| Produk: detail, edit, penyesuaian stok | ⚠️ | berfungsi, tapi lihat B12, B13, B14 |
| Produk: hapus | ✅ | peringatan jelas, data ikut terhapus |
| Kategori | ✅ | 14 kategori, cek duplikat nama+kelas jalan |
| Penjualan baru (POS): cari, keranjang, diskon, checkout | ✅ | harga, diskon per buku & pesanan, stok terpotong benar |
| Pesanan: daftar, detail, transisi status, hapus | ✅ | DRAFT→Diproses→Selesai, COMPLETED final, hapus mengembalikan stok |
| Laporan penjualan | ⚠️ | agregasi benar, tapi lihat B11 |
| Laporan inventaris | ✅ | Masuk/Keluar/Stok cocok dengan ledger |
| Ekspor PDF / CSV / JSON | ❌ | lihat B4, B5 |
| Dokumen cetak (surat jalan, nota thermal) | ✅ | escaping benar, isi lengkap |
| Asisten AI (tool calling) | ✅ | panggil tool "stok menipis", hasil sesuai data nyata |
| Pengaturan: tes provider AI | ✅ | "Koneksi OK — 8 model ditemukan" |
| Tema terang/gelap | ✅ | termasuk logo per tema |

**17 temuan** (3 tinggi, 4 menengah, 10 ringan), semuanya dengan lokasi kode dan bukti.
Belum ada yang saya ubah — laporan ini murni hasil uji.

Data uji dikembalikan ke kondisi semula; lihat bagian "Jejak uji & pembersihan" di bawah.

---

## Temuan berdampak tinggi

### B1 — Tanggal bisnis memakai UTC, bukan waktu lokal

`new Date().toISOString().slice(0, 10)` adalah **tanggal UTC**. Di Lombok (WITA,
UTC+8), antara pukul 00:00–08:00 lokal nilainya masih tanggal kemarin.

Bukti:

```
2 Okt 2026, 07.30 WITA
  new Date().toISOString().slice(0,10)  ->  2026-10-01   ← dipakai aplikasi
  tanggal lokal sebenarnya              ->  2026-10-02

1 Nov 2026, 02.00 WITA
  toISOString().slice(0,7)              ->  2026-10   (bulan lalu)
```

Lokasi: `dashboard/page.tsx:34` (kartu "Hari Ini"), `sales/new/page.tsx:72`, `:221`,
`:264` (`order_date` pesanan + tanggal surat jalan), `reports/sales/page.tsx:18-19`
(filter default harian & bulanan).

Dampak: penjualan pagi tercatat sebagai kemarin dan tidak muncul di kartu "Hari Ini"
maupun laporan harian; tiap tanggal 1 dini hari laporan bulanan default menunjuk bulan
lalu. Sesi uji ini berjalan pukul 23.00 sehingga bug ini tidak tampak di layar —
angkanya saya hitung langsung dari `Date` seperti di atas.

Perbaikan: satu helper bersama (`todayLocal()`, `monthLocal()`) memakai
`Intl.DateTimeFormat("en-CA", { timeZone })`, lalu pakai di keenam lokasi.

### B11 — Penjualan yang sudah dibayar tidak muncul di laporan sampai ditandai "Selesai"

`reports/sales/page.tsx:21` dan kartu dashboard (`dashboard/page.tsx:33`) hanya
menghitung `status === "COMPLETED"`, padahal:

- POS `/sales/new` menyimpan checkout walk-in langsung sebagai **`CHECKED_OUT`**
  (`sales/new/page.tsx:232`) dan stok sudah terpotong di titik itu
  (`store-context.tsx:798`, `checkoutOrder`).

Bukti langsung dari sesi uji: saya buat pesanan **INV-002** (Rp 9.000, hari itu juga),
status "Diproses". Laporan penjualan harian 2026-10-02 menampilkan **Rp 0 / 0 transaksi
/ "Tidak ada data"**. Setelah pesanan ditandai "Selesai", barulah muncul
Rp 9.000 / 1 transaksi / 1 item / diskon Rp 1.000.

Jadi setiap penjualan kasir hilang dari laporan (dan dari kartu "Penjualan Hari Ini")
sampai seseorang membuka pesanan itu dan menekan "Tandai Selesai" satu per satu.

Perbaikan: laporan & dashboard sebaiknya memasukkan `CHECKED_OUT` (uang sudah masuk
dan stok sudah keluar), atau tampilkan baris terpisah "belum diselesaikan" agar
angkanya tidak menyesatkan.

### B2 — Potong stok bisa separuh jalan dan terulang dua kali

`store-context.tsx:567` (`deductStockAndRecord`) menulis movement `SALE` satu per satu
dan berhenti di error pertama tanpa rollback:

```ts
for (const item of items) {
  const { error } = await supabase.from("stock_movements").insert({ ... });
  if (error) return false;          // item sebelumnya sudah tersimpan
}
```

Kalau insert ke-3 gagal (jaringan/RLS/constraint), item ke-1 dan ke-2 sudah memotong
stok sementara fungsi mengembalikan `false` dan order tetap `DRAFT`. UI menyuruh
pengguna mencoba lagi (`sales/orders/[id]/page.tsx:330`, `sales/orders/page.tsx:203`)
→ item yang sudah terpotong terpotong **lagi**.

Pola sama untuk pengembalian stok saat pembatalan (`store-context.tsx:857`, `RETURN`
per item, error tidak dicek) → gagal di tengah = stok sebagian kembali, order tidak
`CANCELLED`; coba ulang = stok menggelembung.

Belum saya reproduksi di data nyata (butuh kegagalan jaringan di tengah loop), tapi
jalurnya deterministik dari kode. Perbaikan: satu RPC/transaksi plpgsql yang
memvalidasi stok dan menyisipkan semua movement sekaligus, atau bulk insert +
kompensasi (hapus movement dengan `reference = invoice`) saat gagal.

---

## Temuan menengah

### B3 — Barcode boleh duplikat, pencarian barcode selalu ambil yang pertama

- `supabase/migration/001_schema.sql:66` `barcode text not null` tanpa `unique`;
  `002_indexes.sql:18` hanya index biasa.
- Form tambah produk memvalidasi duplikat **hanya di klien**
  (`stock/products/new/page.tsx:78`).
- Form edit **tidak memvalidasi sama sekali** (lihat B13).
- POS mencari dengan `products.find((p) => p.barcode === code)`
  (`sales/new/page.tsx:151`) → selalu produk pertama yang cocok.

Dampak: buku salah masuk keranjang dan terjual. Perbaikan: unique index parsial
(`where barcode <> ''`) + validasi di form edit.

### B4 — Ekspor PDF laporan menyisipkan data tanpa escape (dikonfirmasi live)

`reports/sales/page.tsx:51` dan `reports/inventory/page.tsx:39` menyusun HTML lewat
`document.write` dan menyisipkan nama pelanggan/produk mentah.

Bukti live: pelanggan bernama `Toko Uji, <b>QA</b>` menghasilkan
`<td>Toko Uji, <b>QA</b></td>` (tag di-parse sebagai HTML). Bandingkan nota thermal &
surat izin jalan untuk pesanan yang sama → keduanya keluar sebagai
`Toko Uji, &lt;b&gt;QA&lt;/b&gt;`.

Payload seperti `<img src=x onerror=...>` akan berjalan di jendela cetak yang satu
origin dan punya `window.opener`. Perbaikan: pakai helper `esc()` yang sudah ada di
`surat-jalan.ts` / `nota-thermal.ts` (pindahkan ke modul bersama).

### B5 — CSV laporan tidak di-quote (dikonfirmasi live)

Bukti live, isi file CSV yang benar-benar dibuat:

```
Invoice,Tanggal,Pelanggan,Items,Subtotal,Diskon,Total,Status
INV-002,2026-10-02,Toko Uji, <b>QA</b>,1,10000,1000,9000,COMPLETED
```

Nama dengan koma menggeser seluruh kolom (baris itu punya 9 kolom, bukan 8). Nilai
yang diawali `=`, `+`, `-`, `@` juga dieksekusi Excel sebagai formula. Lokasi:
`reports/sales/page.tsx:82`, `reports/inventory/page.tsx:59`.

### B13 — Form edit produk tidak punya validasi apa pun

Baris 71 di `stock/products/[id]/page.tsx`:

```ts
const handleSave = () => {
  updateProduct(id, { name, categoryId, barcode: barcode.trim(), description, ... });
  setEditing(false);          // tidak di-await
};
```

Tidak ada cek nama kosong, barcode duplikat, harga 0, atau tahun — semuanya ada di
form tambah produk (B3 memanfaatkan celah ini). `setEditing(false)` juga berjalan
sebelum hasil simpan diketahui, jadi kegagalan simpan hanya muncul di console.

### B6 — Ganti harga produk menghapus semua tier lebih dulu

`store-context.tsx:468-479`: `delete()` seluruh `product_prices` lalu `insert()` yang
baru, **tanpa memeriksa `error`**. Kalau insert gagal (mis. dua tier bernama sama
melanggar `unique (product_id, tier_name)`), semua harga produk hilang tanpa pesan ke
UI. Perbaikan: periksa error insert + lakukan dalam satu transaksi/`upsert`.

### B7 — Pesanan bisa tersimpan tanpa item / tanpa surat jalan

`store-context.tsx` (`addOrder`): baris order disisipkan dulu; kegagalan insert item
hanya `console.error(...)` sehingga order tetap ada dengan 0 item dan nomor invoice
terpakai. Insert `surat_jalans` bahkan tidak diperiksa sama sekali.

---

## Temuan ringan

### B12 — Link "edit" dari daftar produk tidak membuka mode edit

Daftar produk menautkan `/stock/products/<id>?edit=1` (ikon pensil), tapi
`stock/products/[id]/page.tsx` tidak pernah membaca query string (`useSearchParams`
tidak dipakai) sehingga halaman terbuka dalam mode lihat dan pengguna harus klik
"Edit" sekali lagi.

### B14 — Penyesuaian stok diam-diam tidak jalan tanpa catatan

`[id]/page.tsx` `handleAdjust`: `if (adjQty === 0 || !adjRef.trim()) return;`
Diuji: qty `2`, catatan kosong, klik OK → tidak ada apa-apa: tidak ada pesan, stok
tetap, kolom qty masih berisi 2. Label "Catatan" juga tidak ditandai wajib.

### B8 — Tombol "Lupa kata sandi?" tidak berfungsi

`login-form.tsx:118-125`: `<button type="button">` tanpa `onClick`/`href` — kontrol mati.

### B15 — Menu "Profil" juga kontrol mati

`app-sidebar.tsx`: `<MenuItem index={0} icon={CircleUserRound} label="Profil" onSelect={() => {}} />`.

### B16 — Dashboard menghitung angka yang tidak pernah ditampilkan

`dashboard/page.tsx:37` dan `:46`: `totalSalesAll` dan `profitAll` dihitung (iterasi
seluruh pesanan) tapi tidak dipakai di JSX — pemborosan yang berubah jadi lag saat data besar.

### B9 — Pesan error login mentah & istilah tidak konsisten

Kredensial salah menampilkan teks asli Supabase "Invalid login credentials" (Inggris)
di UI Indonesia; kotak errornya tidak ber-`role="alert"`; validasi password berbunyi
"Password wajib diisi" padahal labelnya "Kata sandi".

### B17 — Halaman login menampilkan angka katalog yang salah

`isometric-queue.tsx:23` menulis teks statis `"1.204 judul tercatat"` di ilustrasi
panel login, padahal katalog nyata berisi 3 produk. Angka ini tidak pernah dibaca dari
data — menyesatkan calon pengguna/admin yang baru masuk.

### B10 — Dark mode berkedip putih saat muat (FOUC)

`theme-context.tsx:19-30` membaca `localStorage` setelah hidrasi; `layout.tsx` tidak
punya script pemblokir sebelum paint. (Sama dengan P5 di `PERFORMANCE_AUDIT.md`.)

---

## Sudah diperiksa dan terbukti BENAR (bukan bug)

- **Ledger stok konsisten.** Laporan inventaris cocok dengan `stock_movements` untuk
  semua produk (mis. Matematika Wajib: Masuk 592 / Keluar 0 / Stok 592; produk uji
  saya: 5 / 1 / 4 saat terjual, lalu kembali 5 / 0 / 5 setelah pesanan dihapus).
  `sync_product_stock()` di `004_triggers.sql` bekerja seperti seharusnya.
- **Anti-oversell** di POS & checkout menolak kuantitas melebihi stok (kode + test).
- **Round-trip bersih:** checkout memotong stok → tandai selesai → hapus pesanan
  mengembalikan stok ke angka semula.
- **COMPLETED bersifat final:** tombol "Batalkan" hilang setelah status Selesai.
- **Escaping** nota thermal dan surat izin jalan benar untuk nama berisi `<b>`.
- **Guard autentikasi** 7 endpoint API: semuanya 401 tanpa sesi; setelah logout,
  `/dashboard` langsung diarahkan ke `/login`.
- **Asisten AI** benar-benar membaca data nyata (tool "stok menipis" mengembalikan
  PPKN 0 pcs dan produk uji saya 4 pcs).
- **Tes provider AI** mengembalikan "Koneksi OK — 8 model ditemukan".
- **Ekspor JSON** lengkap: 10 tabel, ukuran 13 KB, `meta.exportedBy` terisi.
- **146 unit test** lolos, `tsc --noEmit` dan ESLint bersih, tidak ada error/warning
  React di console selama seluruh sesi uji.

## Catatan kualitas data (bukan bug kode)

- Produk "Matematika" bermodal Rp 0 → kolom Laba/pcs menampilkan 100% (angka laba jadi
  menyesatkan sampai modal diisi).
- Barcode "Matematika" (`ffdfdfzdfdz`) dan "PPKN" (`121212`) adalah data uji, bukan ISBN.
- Foto sampul "Matematika Wajib" adalah gambar botol jus.
- Kategori "bahasa" berdeskripsi "asdasdasd".
- INV-001 berisi item "Bahasa Nihongjin" yang produknya sudah dihapus, sehingga total
  Rp 150.000 tetap masuk laporan tapi tidak teratribusi ke produk mana pun
  (`order_items.product_id` → `on delete set null`).

## Jejak uji & pembersihan

Dibuat lalu dihapus kembali: produk "ZZ Uji Otomatis QA" (QA-UJI-001) dan pesanan
INV-002 beserta item, surat jalan, dan movement-nya.

Kondisi akhir database diverifikasi lewat ekspor JSON dan halaman Pengaturan:
`categories 14 · customers 0 · products 3 · product_prices 7 · orders 1 ·
order_items 1 · surat_jalans 1`. Satu-satunya sisa adalah **2 baris penyesuaian stok
di produk PPKN** (`+1` dan `-1`, catatan "Uji QA +1"/"Uji QA -1 (kembalikan)") yang
saya pakai menguji fitur penyesuaian stok; stok PPKN tetap 0 seperti semula, tapi
"Riwayat Stok" produk itu kini berisi 2 baris. Hapus manual bila tidak diinginkan.

## Usulan urutan perbaikan

1. **B11** dan **B1** — keduanya membuat laporan/angka yang dilihat pemilik toko
   salah, dan perbaikannya kecil (filter status + helper tanggal).
2. **B2** — satu-satunya jalur yang bisa merusak stok secara permanen.
3. **B4 + B5 + B6** — keamanan/escaping dan integritas data, satu helper bersama.
4. **B3 + B13** — validasi form edit + unique index barcode.
5. Sisanya (B7, B12, B14, B8, B15, B16, B9, B10, B17) — perbaikan kecil, bisa sekaligus.
