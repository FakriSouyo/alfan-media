-- ============================================================================
-- 004_triggers.sql
-- Trigger untuk updated_at otomatis dan helper stok.
-- Jalankan SETELAH 001_schema.sql, 002_indexes.sql, dan 003_rls.sql.
-- ============================================================================

-- ─── Generic updated_at trigger ──────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tabel-tabel yang punya kolom updated_at
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'profiles', 'categories', 'products', 'product_prices',
      'customers', 'orders', 'surat_jalans', 'settings'
    ])
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_updated_at
         before update on public.%1$I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;

-- ─── Helper: sinkronkan products.stock dari stock_movements ──────────────
-- products.stock = SUM(quantity) untuk produk tersebut.
-- Dipanggil SETELAH insert/update/delete di stock_movements.
create or replace function public.sync_product_stock()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
  v_total      int;
begin
  -- Tentukan product_id berdasarkan operasi (INSERT/UPDATE/DELETE)
  v_product_id := coalesce(new.product_id, old.product_id);

  select coalesce(sum(quantity), 0)
    into v_total
  from public.stock_movements
  where product_id = v_product_id;

  update public.products
     set stock = greatest(0, v_total),
         updated_at = now()
   where id = v_product_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_stock_movements_sync on public.stock_movements;
create trigger trg_stock_movements_sync
  after insert or update or delete on public.stock_movements
  for each row execute function public.sync_product_stock();

-- ─── Helper: nomor invoice otomatis (INV-001, INV-002, ...) ─────────────
-- Bisa dipanggil sebelum insert: SELECT next_invoice_no();
create or replace function public.next_invoice_no()
returns text
language plpgsql
as $$
declare
  v_max int;
  v_next int;
begin
  -- Cari nomor terbesar dari invoice_no yang berawalan "INV-"
  select coalesce(max(
    case
      when invoice_no ~ '^INV-[0-9]+$'
        then substring(invoice_no from 5)::int
      else 0
    end
  ), 0)
  into v_max
  from public.orders;

  v_next := v_max + 1;
  return 'INV-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function public.next_invoice_no() to authenticated;
