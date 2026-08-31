-- 011: Arsip pesanan
-- "Hapus" pesanan diganti ARSIP: pesanan tersembunyi dari daftar, tetapi
-- barisnya tetap di DB — stok (ledger) dan total penjualan TIDAK terpengaruh.
alter table orders add column if not exists archived boolean not null default false;
create index if not exists orders_archived_idx on orders (archived);
