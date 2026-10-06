# Audit Performa — Toko Buku Alfan Media

Tanggal: 2 Oktober 2026 · Basis: kondisi repo saat ini (1.204 produk, `order_items` dan
`stock_movements` tumbuh satu baris per item terjual).

Metode: pembacaan jalur render yang benar-benar dipakai (bukan komponen library yang
tidak diimpor), plus benchmark sintetis untuk pola berulang yang mencurigakan
(`products` 1.204 × `orders` 2.000 × 3 item).

Ringkasan: tidak ada infinite loop atau memory leak. Masalah utamanya **kompleksitas
algoritmik yang dijalankan ulang setiap render** (O(produk × riwayat)) dan **store
global yang me-refetch & menulis ulang seluruh data pada setiap mutasi** — keduanya
memburuk seiring bertambahnya transaksi.

---

## P1. `getSoldStats()` dipanggil untuk setiap baris produk — O(produk × order × item)

`src/app/(app)/stock/products/page.tsx:68` (`getSalesHistory`), `:79` (`getSoldStats`),
dipanggil di `:264` **di dalam** `filtered.map(...)`. Setiap panggilan menelusuri
seluruh `orders[].items` lalu `rows.sort()` per produk.

Bukti (benchmark, hanya perhitungan angka, belum termasuk render 1.204 baris):

```
1.204 produk × 2.000 order × 3 item  →  101 ms per render
```

Karena `search`/`catFilter` adalah state komponen yang sama dan `filtered` tidak
di-memo, **setiap ketikan di kotak cari mengulang 101 ms** pekerjaan itu, lalu
direkonsiliasi ke ~12.000 node DOM tabel. Dengan 5.000 order biayanya ~250 ms per
render (di bawah itu browser sudah terasa "berat").

Perbaikan: satu pass agregasi ke `Map<productId, stats>` di dalam `useMemo([orders])`,
dipakai semua baris. Alternatif jangka panjang: view/RPC agregat di Postgres.

## P2. `refresh()` memuat 8 tabel penuh dan join-nya O(n²) di main thread

`src/lib/store-context.tsx:266-300`:

- 8 × `select("*")` paralel, termasuk `order_items` dan `stock_movements` **tanpa
  filter/pagination** — seluruh riwayat toko diunduh ke memori & state.
- `:283` `priceRows.filter(...)` untuk setiap produk.
- `:296` `itemRows.filter(...)` untuk setiap order → O(order × order_item).
- `:293` `sjRows.find(...)` untuk setiap order.

Dan `refresh()` dipanggil setelah **setiap** mutasi: `addProduct`, `updateProduct`,
`addOrder`, `updateOrder`, `updateSuratJalan`, `checkoutOrder`, `completeOrder`,
`cancelOrder`, `archiveOrder`, `deleteOrder`, `adjustStock`. Menambah stok satu buku
= 8 query + rebuild seluruh array + re-render seluruh aplikasi.

Perbaikan: (a) index `Map` untuk join, (b) `select` hanya kolom yang dipakai,
(c) patch state lokal setelah mutasi (optimistic) dan simpan refetch penuh untuk
kasus yang benar-benar butuh (mis. akhir turunan agent).

## P3. Value `StoreContext` tidak di-memo

`src/lib/store-context.tsx:944` — object literal baru pada setiap render provider,
jadi setiap perubahan `loading`/satu array menandai **semua** konsumer `useStore()`
untuk render ulang (dashboard, produk, penjualan, laporan, agent-chat). Ini
pengganda dari semua temuan lain.

Perbaikan: `useMemo` untuk value; idealnya pisahkan data (`products`, `orders`, …)
dan actions (stabil) menjadi dua context agar komponen yang hanya memanggil
`addOrder` tidak ikut re-render saat data berubah.

## P4. `/sales/new` merender seluruh katalog + gambar remote tanpa lazy

`src/app/(app)/sales/new/page.tsx`:

- `:101` `filteredProducts` dihitung ulang setiap render (biaya filter sendiri kecil:
  0,68 ms untuk 1.204 produk, `toLowerCase` per baris tetap pemborosan).
- `:322` `productImageUrl(p.imagePath)` per baris dan `<img>` **tanpa
  `loading="lazy"`/`decoding="async"`** → hingga 1.204 permintaan ke Supabase Storage
  sekaligus, plus ~6.000 node DOM untuk daftar. Ini sumber lag terbesar di layar POS
  (setiap keystroke, setiap perubahan keranjang).
- `:409` `products.find(...)` untuk setiap item keranjang → O(keranjang × produk).

Perbaikan: virtualisasi daftar (`content-visibility: auto` cukup untuk mulai),
`loading="lazy"`, `useMemo` untuk filter + `Map` kategori/produk.

## P5. Dark mode berkedip putih saat pertama muat (FOUC)

`src/lib/theme-context.tsx:19-30` membaca `localStorage` di initializer client, dan
`src/app/layout.tsx` tidak menempelkan script pemblokir. HTML awal selalu ter-render
terang; class `.dark` baru dipasang di efek setelah mount/hidrasi. Pengguna dark mode
melihat flash putih di setiap reload.

Perbaikan: script inline kecil di `<head>` yang menyetel `.dark` sebelum paint, atau
simpan pilihan tema di cookie dan set dari server.

## P6. `/reports/inventory` — `movements.filter` per produk

`src/app/(app)/reports/inventory/page.tsx:21-34` menelusuri seluruh `movements` untuk
setiap produk → O(produk × movement). `movements` adalah tabel yang paling cepat
tumbuh. Perbaikan sama seperti P1: satu pass ke `Map`.

## P7. Scan barcode: decode ZXing di main thread, 4×/detik

`src/hooks/use-barcode-scanner.ts:41` (`DETECT_INTERVAL_MS = 250`) dan `:189`
(`reader.decodeFromCanvas`) dijalankan dari loop `requestAnimationFrame` (`:203-236`).
Setiap decode berjalan di main thread dan memblokir frame; selama mode scan aktif UI
tersendat (dan rAF 60 fps itu sendiri hanya dipakai untuk mengecek timestamp).

Perbaikan: pindahkan decode ke Web Worker (atau pakai `BarcodeDetector` bawaan bila
tersedia), atau minimal longgarkan interval.

## P8. N+1 insert pada mutasi stok

- `src/lib/store-context.tsx:567` — insert `stock_movements` satu per satu per item
  saat checkout (satu round-trip per item).
- `:857` — `RETURN` satu per satu saat `cancelOrder`.

Perbaikan: satu bulk insert (`.insert(array)`), lalu verifikasi stok lewat RPC
transaksional agar anti-oversell tetap terjaga.

## P9. Chat AI: setiap token mengganti seluruh array `messages`

`src/components/agent/agent-chat.tsx:377` (`patchMessage`) memakai
`setMessages(c => c.map(...))` untuk **setiap delta SSE**, dan bubble pesan tidak
di-`memo`, sehingga semua pesan di thread di-render ulang puluhan kali per detik saat
streaming; markdown di bubble aktif diparse ulang tiap token. Persistensi localStorage
sendiri sudah benar (hanya saat `busy === false`, lihat `:286-288`).

Perbaikan: `memo` pada bubble pesan, pisahkan pesan yang sedang streaming dari daftar,
dan throttle flush markdown (~1 frame).

## P10. Agregat tanpa `useMemo` di dashboard & laporan

`src/app/(app)/dashboard/page.tsx:31-46` dan
`src/app/(app)/reports/sales/page.tsx:21-40` menghitung filter/reduce atas seluruh
order pada setiap render. Sama seperti P1: satu `useMemo` per agregat sudah cukup.

---

## Yang sudah baik / bukan masalah

- Interval dan animasi di `motion/loader.tsx`, `reasoning-text.tsx`, `text-scramble.tsx`
  tidak berjalan di runtime aplikasi — komponennya tidak diimpor halaman mana pun.
- Loop decode kamera berhenti saat unmount (`use-barcode-scanner.ts:246`).
- Riwayat chat tidak ditulis ke `localStorage` per token (sudah dijaga).
- `useFavicon` (citation) sudah menangani 403/404 favicon situs luar dengan `decode()`.
- `npx tsc --noEmit` bersih, ESLint bersih, 146 test lolos.
- Catatan kecil: `next dev` memperingatkan konvensi `middleware` sudah usang
  (disarankan `proxy`) — bukan penyebab lag, tapi perlu migrasi sebelum upgrade.

## Urutan perbaikan yang disarankan

1. **P1** — satu `useMemo`, dampak terbesar dengan perubahan terkecil.
2. **P2 + P3** — akar dari hampir semua re-render; kerjakan bersama.
3. **P4** — layar yang paling sering dipakai kasir.
4. **P5**, **P6**, **P9** — perbaikan kecil, terasa jelas.
5. **P7**, **P8**, **P10** — penguatan.
