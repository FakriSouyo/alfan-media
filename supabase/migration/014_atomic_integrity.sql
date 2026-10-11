-- Atomic order, inventory, and product-price operations.
-- Additive only: existing rows and stock ledger entries are never rewritten.
-- Run the duplicate-report queries below before applying the unique indexes.

-- Preflight (run separately first if the migration reports a conflict):
-- select lower(btrim(barcode)) as normalized_barcode, array_agg(id order by id) as product_ids
-- from public.products where btrim(barcode) <> ''
-- group by lower(btrim(barcode)) having count(*) > 1;
-- select lower(btrim(name)) as normalized_name, coalesce(level, '') as level, array_agg(id order by id) as category_ids
-- from public.categories group by lower(btrim(name)), coalesce(level, '') having count(*) > 1;
-- Resolve conflicts deliberately, then rerun this migration. No record is changed here.

do $$
declare
  barcode_conflicts text;
  category_conflicts text;
begin
  select string_agg(format('%s [%s]', normalized_barcode, ids), '; ')
    into barcode_conflicts
  from (
    select lower(btrim(barcode)) as normalized_barcode,
           array_agg(id::text order by id) as ids
    from public.products
    where btrim(barcode) <> ''
    group by lower(btrim(barcode))
    having count(*) > 1
  ) duplicates;

  select string_agg(format('%s / %s [%s]', normalized_name, level_value, ids), '; ')
    into category_conflicts
  from (
    select lower(btrim(name)) as normalized_name,
           coalesce(level, '') as level_value,
           array_agg(id::text order by id) as ids
    from public.categories
    group by lower(btrim(name)), coalesce(level, '')
    having count(*) > 1
  ) duplicates;

  if barcode_conflicts is not null or category_conflicts is not null then
    raise exception 'Unique index preflight failed. Barcode conflicts: %. Category conflicts: %. Review the preflight queries in migration 014 and resolve records manually before retrying.',
      coalesce(barcode_conflicts, 'none'), coalesce(category_conflicts, 'none');
  end if;
end;
$$;

create unique index if not exists uq_products_barcode_nonempty
  on public.products (lower(btrim(barcode)))
  where btrim(barcode) <> '';

create unique index if not exists uq_categories_name_level
  on public.categories (lower(btrim(name)), coalesce(level, ''));

-- Internal helper. Locks all affected products in stable ID order, validates
-- stock, and writes one movement per product in the caller's transaction.
create or replace function public.apply_order_stock(p_order_id uuid, p_invoice_no text, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
  expected_count integer;
  mismatch boolean;
  short_product text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action not in ('SALE', 'RETURN') then raise exception 'Unsupported stock action'; end if;
  if p_action = 'SALE' then
    select count(*) into expected_count
    from (
      select product_id
      from public.order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    ) expected;

    select count(*) into existing_count
    from (
      select product_id from public.stock_movements
      where reference = p_invoice_no and type = 'SALE'
      group by product_id
    ) existing;

    if existing_count > 0 then
      select exists (
        with expected as (
          select product_id, -sum(quantity)::integer as qty
          from public.order_items where order_id = p_order_id and product_id is not null group by product_id
        ), actual as (
          select product_id, sum(quantity)::integer as qty
          from public.stock_movements where reference = p_invoice_no and type = 'SALE' group by product_id
        )
        select 1 from expected full join actual using (product_id)
        where coalesce(expected.qty, 0) <> coalesce(actual.qty, 0)
      ) into mismatch;
      if mismatch then raise exception 'Existing SALE ledger entries for % do not match order items; manual reconciliation is required', p_invoice_no; end if;
      return;
    end if;

    if exists (select 1 from public.order_items where order_id = p_order_id and product_id is null) then
      raise exception 'Cannot check out % because one or more items no longer reference a product', p_invoice_no;
    end if;
    if expected_count = 0 then raise exception 'Cannot check out an order with no items'; end if;

    perform p.id
    from public.products p
    join (select distinct product_id from public.order_items where order_id = p_order_id and product_id is not null) i on i.product_id = p.id
    order by p.id
    for update of p;

    select p.id::text into short_product
    from public.products p
    join (
      select product_id, sum(quantity)::integer as qty
      from public.order_items where order_id = p_order_id and product_id is not null group by product_id
    ) required on required.product_id = p.id
    where p.stock < required.qty
    order by p.id
    limit 1;
    if short_product is not null then
      raise exception 'Insufficient stock for product % while checking out %', short_product, p_invoice_no using errcode = 'P0001';
    end if;

    insert into public.stock_movements (product_id, type, quantity, reference, created_by)
    select product_id, 'SALE', -sum(quantity)::integer, p_invoice_no, auth.uid()
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id;
    return;
  end if;

  -- A legacy CHECKED_OUT order without SALE movements had not deducted stock;
  -- cancelling it must not invent a return movement.
  if not exists (select 1 from public.stock_movements where reference = p_invoice_no and type = 'SALE') then
    return;
  end if;

  select exists (
    with expected as (
      select product_id, -sum(quantity)::integer as qty
      from public.order_items where order_id = p_order_id and product_id is not null group by product_id
    ), actual as (
      select product_id, sum(quantity)::integer as qty
      from public.stock_movements where reference = p_invoice_no and type = 'SALE' group by product_id
    )
    select 1 from expected full join actual using (product_id)
    where coalesce(expected.qty, 0) <> coalesce(actual.qty, 0)
  ) into mismatch;
  if mismatch then raise exception 'Existing SALE ledger entries for % do not match order items; manual reconciliation is required', p_invoice_no; end if;

  select exists (
    with expected as (
      select product_id, sum(quantity)::integer as qty
      from public.order_items where order_id = p_order_id and product_id is not null group by product_id
    ), actual as (
      select product_id, sum(quantity)::integer as qty
      from public.stock_movements where reference = p_invoice_no and type = 'RETURN' group by product_id
    )
    select 1 from expected full join actual using (product_id)
    where coalesce(expected.qty, 0) <> coalesce(actual.qty, 0)
  ) into mismatch;
  if mismatch then raise exception 'Existing RETURN ledger entries for % are partial or inconsistent; manual reconciliation is required', p_invoice_no; end if;

  insert into public.stock_movements (product_id, type, quantity, reference, created_by)
  select product_id, 'RETURN', sum(quantity)::integer, p_invoice_no, auth.uid()
  from public.order_items
  where order_id = p_order_id and product_id is not null
  group by product_id
  having not exists (
    select 1 from public.stock_movements m
    where m.reference = p_invoice_no and m.type = 'RETURN'
  );
end;
$$;

create or replace function public.create_order_atomic(p_order jsonb, p_items jsonb, p_surat_jalan jsonb default null)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.orders;
  requested_status public.order_status;
  invoice_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Order items must be an array'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Order must contain at least one item'; end if;
  requested_status := coalesce(p_order->>'status', 'DRAFT')::public.order_status;
  if requested_status not in ('DRAFT', 'CHECKED_OUT') then raise exception 'New orders must start as DRAFT or CHECKED_OUT'; end if;

  perform pg_advisory_xact_lock(hashtext('public.orders.invoice_no'));
  select 'INV-' || lpad((coalesce(max(substring(invoice_no from 5)::integer), 0) + 1)::text, 3, '0')
    into invoice_number
  from public.orders
  where invoice_no ~ '^INV-[0-9]+$';

  insert into public.orders (invoice_no, order_date, customer_id, customer_name, subtotal, discount, total, status, created_by)
  values (
    invoice_number,
    (p_order->>'order_date')::date,
    nullif(p_order->>'customer_id', '')::uuid,
    p_order->>'customer_name',
    (p_order->>'subtotal')::bigint,
    (p_order->>'discount')::bigint,
    (p_order->>'total')::bigint,
    'DRAFT',
    auth.uid()
  ) returning * into result;

  insert into public.order_items (order_id, product_id, product_name, product_barcode, quantity, unit_price, price_tier, custom_price, discount_percent, subtotal, cost_price)
  select
    result.id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_name',
    coalesce(item->>'product_barcode', ''),
    (item->>'quantity')::integer,
    (item->>'unit_price')::bigint,
    coalesce(item->>'price_tier', 'Normal'),
    nullif(item->>'custom_price', '')::bigint,
    coalesce((item->>'discount_percent')::numeric, 0),
    (item->>'subtotal')::bigint,
    coalesce((item->>'cost_price')::bigint, 0)
  from jsonb_array_elements(p_items) item;

  if p_surat_jalan is not null and jsonb_typeof(p_surat_jalan) = 'object' then
    insert into public.surat_jalans (order_id, no, tanggal, pengirim, penerima, estimasi, nama_pengirim, kendaraan, catatan)
    values (
      result.id,
      coalesce(p_surat_jalan->>'no', ''),
      coalesce(nullif(p_surat_jalan->>'tanggal', '')::date, (p_order->>'order_date')::date),
      coalesce(p_surat_jalan->>'pengirim', ''),
      coalesce(p_surat_jalan->>'penerima', ''),
      coalesce(p_surat_jalan->>'estimasi', ''),
      coalesce(p_surat_jalan->>'nama_pengirim', ''),
      coalesce(p_surat_jalan->>'kendaraan', ''),
      coalesce(p_surat_jalan->>'catatan', '')
    );
  end if;

  if requested_status = 'CHECKED_OUT' then
    perform public.apply_order_stock(result.id, invoice_number, 'SALE');
    update public.orders set status = 'CHECKED_OUT' where id = result.id returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.transition_order_atomic(p_invoice_no text, p_target text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_order public.orders;
  target_status public.order_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  target_status := p_target::public.order_status;
  select * into current_order from public.orders where invoice_no = p_invoice_no for update;
  if not found then return false; end if;

  if target_status = 'CHECKED_OUT' then
    if current_order.status = 'CHECKED_OUT' then return true; end if;
    if current_order.status <> 'DRAFT' then return false; end if;
    perform public.apply_order_stock(current_order.id, p_invoice_no, 'SALE');
  elsif target_status = 'COMPLETED' then
    if current_order.status = 'COMPLETED' then return true; end if;
    if current_order.status <> 'CHECKED_OUT' then return false; end if;
    -- Legacy checked-out orders may predate stock deduction; the helper only
    -- writes a SALE when no exact movement set exists.
    perform public.apply_order_stock(current_order.id, p_invoice_no, 'SALE');
  elsif target_status = 'CANCELLED' then
    if current_order.status = 'CANCELLED' then return true; end if;
    if current_order.status = 'COMPLETED' then return false; end if;
    if current_order.status = 'CHECKED_OUT' then
      perform public.apply_order_stock(current_order.id, p_invoice_no, 'RETURN');
    end if;
  else
    raise exception 'Unsupported order transition';
  end if;

  update public.orders set status = target_status where id = current_order.id;
  return true;
end;
$$;

create or replace function public.delete_order_atomic(p_invoice_no text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into order_id from public.orders where invoice_no = p_invoice_no for update;
  if order_id is null then return false; end if;
  delete from public.stock_movements
  where reference = p_invoice_no and type in ('SALE', 'RETURN', 'CANCELLED_ORDER');
  delete from public.orders where id = order_id;
  return true;
end;
$$;

create or replace function public.create_product_atomic(p_product jsonb, p_prices jsonb, p_initial_stock integer)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.products;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_prices) is distinct from 'array' then raise exception 'Product prices must be an array'; end if;
  if jsonb_array_length(p_prices) = 0 then raise exception 'At least one product price is required'; end if;
  if p_initial_stock is null or p_initial_stock < 0 then raise exception 'Initial stock cannot be negative'; end if;
  insert into public.products (name, category_id, barcode, description, published_year, semester, stock, cost_price, image_path)
  values (
    p_product->>'name', nullif(p_product->>'category_id', '')::uuid, coalesce(p_product->>'barcode', ''),
    coalesce(p_product->>'description', ''), nullif(p_product->>'published_year', '')::integer,
    coalesce(p_product->>'semester', 'Ganjil')::public.semester, 0,
    coalesce((p_product->>'cost_price')::bigint, 0), nullif(p_product->>'image_path', '')
  ) returning * into result;
  insert into public.product_prices (product_id, tier_name, price, is_default)
  select result.id, price_row.tier_name, price_row.price, coalesce(price_row.is_default, false)
  from jsonb_to_recordset(p_prices) as price_row(tier_name text, price bigint, is_default boolean);
  if p_initial_stock > 0 then
    insert into public.stock_movements (product_id, type, quantity, reference, notes, created_by)
    values (result.id, 'INITIAL', p_initial_stock, 'Stock awal', 'Stok awal saat produk dibuat', auth.uid());
    select * into result from public.products where id = result.id;
  end if;
  return result;
end;
$$;

create or replace function public.update_product_atomic(p_id uuid, p_patch jsonb, p_prices jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.products set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    category_id = case when p_patch ? 'category_id' then nullif(p_patch->>'category_id', '')::uuid else category_id end,
    barcode = case when p_patch ? 'barcode' then p_patch->>'barcode' else barcode end,
    description = case when p_patch ? 'description' then p_patch->>'description' else description end,
    published_year = case when p_patch ? 'published_year' then nullif(p_patch->>'published_year', '')::integer else published_year end,
    semester = case when p_patch ? 'semester' then (p_patch->>'semester')::public.semester else semester end,
    cost_price = case when p_patch ? 'cost_price' then (p_patch->>'cost_price')::bigint else cost_price end,
    image_path = case when p_patch ? 'image_path' then nullif(p_patch->>'image_path', '') else image_path end
  where id = p_id;
  if not found then return false; end if;

  if p_prices is not null then
    if jsonb_typeof(p_prices) is distinct from 'array' then raise exception 'Product prices must be an array'; end if;
    if jsonb_array_length(p_prices) = 0 then raise exception 'At least one product price is required'; end if;
    update public.product_prices set is_default = false where product_id = p_id;
    delete from public.product_prices where product_id = p_id and tier_name not in (
      select tier_name from jsonb_to_recordset(p_prices) as price_row(tier_name text)
    );
    insert into public.product_prices (product_id, tier_name, price, is_default)
    select p_id, price_row.tier_name, price_row.price, coalesce(price_row.is_default, false)
    from jsonb_to_recordset(p_prices) as price_row(tier_name text, price bigint, is_default boolean)
    on conflict (product_id, tier_name) do update
      set price = excluded.price, is_default = excluded.is_default;
  end if;
  return true;
end;
$$;

revoke all on function public.apply_order_stock(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_order_atomic(jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.transition_order_atomic(text, text) from public, anon;
revoke all on function public.delete_order_atomic(text) from public, anon;
revoke all on function public.create_product_atomic(jsonb, jsonb, integer) from public, anon;
revoke all on function public.update_product_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_order_atomic(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.transition_order_atomic(text, text) to authenticated;
grant execute on function public.delete_order_atomic(text) to authenticated;
grant execute on function public.create_product_atomic(jsonb, jsonb, integer) to authenticated;
grant execute on function public.update_product_atomic(uuid, jsonb, jsonb) to authenticated;
