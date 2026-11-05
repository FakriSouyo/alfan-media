# Alfan Media

POS toko buku: inventori dengan ledger stok, penjualan, barcode, surat jalan, nota thermal, laporan, dan AI assistant.

Stack: **React 19 + Vite + React Router + Hono + Cloudflare Workers + D1 + R2 + Better Auth**.

Aplikasi: [Alfan Media di Cloudflare](https://tokobuku-alfan-media.freebuff-app.workers.dev).

Gunakan Node.js 24 dan npm. `package-lock.json` menjadi lockfile utama.

```powershell
npm install
node scripts/setup-local.mjs
npm run db:migrate:local
npm run dev
```

Buka http://localhost:3000. Database lokal terpisah dari produksi; impor data dan aktivasi akun lokal mengikuti [panduan migrasi](MIGRATION.md).

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Untuk Cloudflare:

```powershell
npm run cf:login
npm run deploy
```

Konfigurasi binding berada di `wrangler.jsonc`. Secret autentikasi produksi berada di Cloudflare Workers; konfigurasi lokal ada di `.dev.vars` yang diabaikan Git.

[Dokumentasi migrasi, aktivasi akun, verifikasi data, pengujian transaksi, dan prosedur rollback](MIGRATION.md).

Data produksi telah disalin dari Supabase ke D1 dan R2. Sumber Supabase tetap dipertahankan sebagai cadangan. Gunakan satu aplikasi untuk menulis transaksi saat cutover. Direktori `migration-data/` memuat backup privat dan tidak boleh dikomit atau dipublikasikan.
