# alfan-media

POS toko buku Alfan Media — Next.js (App Router) + Supabase (Postgres + RLS):
inventori berbasis ledger stok, penjualan/POS (anti-oversell, scan barcode,
surat jalan), laporan penjualan, dan AI Assistant dengan tool calling.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

Test suite (Vitest + Testing Library) menutupi alur utama store setelah migrasi Supabase:

```bash
npm test          # jalankan semua test sekali
npm run test:watch
```

File test:

- `src/lib/__tests__/store-context.test.tsx` — seluruh flow `StoreProvider`:
  pemetaan data awal, kategori (termasuk label kelas bebas `"SD I"` — bug
  enum `category_level` pasca-migrasi), produk (+ movement `INITIAL` untuk
  stok awal), pelanggan, invoice (RPC `next_invoice_no` + fallback), order +
  item + surat jalan, transisi status (`SALE`/`RETURN` movement), penyesuaian
  stok, serta **guard skema DB** (mock menolak enum/uuid/date/int/CHECK yang
  tak valid, persis seperti Postgres).
- `src/lib/__tests__/currency.test.ts` — format mata uang.
- `src/lib/__tests__/surat-jalan.test.ts` / `nota-thermal.test.ts` — generator
  dokumen (surat jalan & nota thermal).

Mock DB in-memory: `src/lib/__tests__/mocks/mock-supabase.ts` — test jalan
tanpa koneksi jaringan/env Supabase, dan memvalidasi skema
(`supabase/migration/*.sql`) agar nilai yang dikirim UI tidak menyimpang dari
DB. Jika skema berubah, sesuaikan konstanta `ENUM_COLUMNS`/`UUID_COLUMNS`/
`DATE_COLUMNS`/`INT_COLUMNS` di file mock.

Migrasi skema: file di `supabase/migration/` dijalankan berurutan (001 → 007)
di Supabase SQL Editor. Yang terbaru: `007_category_level_to_text.sql`
(mengubah `categories.level` dari enum 3 nilai menjadi text agar label
`"SD I"`..`"SMA III"` bisa tersimpan).

Catatan lingkungan tertentu (sandbox yang memblokir `child_process.spawn`):
jika Vitest gagal dengan `spawn EPERM`, jalankan dengan preload workaround:

```bash
node --import ./scripts/vitest-preload.mjs node_modules/vitest/vitest.mjs run
```

dan `npm run build` perlu `experimental.useTypeScriptCli: false` di
`next.config.ts` agar type-check tidak menspawn proses `tsc` terpisah.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
