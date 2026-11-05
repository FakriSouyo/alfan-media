-- Generated from the production schema; apply only to a NEW D1 database.
PRAGMA foreign_keys = ON;

create table if not exists profiles (
  id            text primary key,
  name          text not null,
  email         text not null unique,
  role          text not null default 'staff' check(role in ('admin','staff')),
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists categories (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  name          text not null,
  level         text,                                
  description   text not null default '',
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists products (
  id              text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  name            text not null,
  category_id     text references categories(id) on delete set null,
  barcode         text not null,
  description     text not null default '',
  published_year  int,
  semester        text not null default 'Ganjil' check(semester in ('Ganjil','Genap')),
  stock           int not null default 0 check (stock >= 0),
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists product_prices (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  product_id    text not null references products(id) on delete cascade,
  tier_name     text not null,                       
  price         integer not null check (price >= 0),  
  is_default    integer not null default 0,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (product_id, tier_name)
);

create table if not exists customers (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  name          text not null,
  price_tier    text not null default 'Normal',  
  phone         text,
  address       text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists orders (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  invoice_no    text not null unique,                  
  order_date    date not null default current_date,
  customer_id   text references customers(id) on delete set null,
  customer_name text not null,                        
  subtotal      integer not null default 0,
  discount      integer not null default 0,
  total         integer not null default 0,
  status        text not null default 'DRAFT' check(status in ('DRAFT','CHECKED_OUT','COMPLETED','CANCELLED')),
  notes         text,
  created_by    text references profiles(id) on delete set null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (total >= 0)
);

create table if not exists order_items (
  id                text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  order_id          text not null references orders(id) on delete cascade,
  product_id        text references products(id) on delete set null,
  product_name      text not null,                    
  product_barcode   text not null,                    
  quantity          int  not null check (quantity > 0),
  unit_price        integer not null check (unit_price >= 0),
  price_tier        text not null default 'Normal',
  custom_price      integer,                           
  discount_percent  numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  subtotal          integer not null check (subtotal >= 0),
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists order_revisions (
  id               text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  order_id         text not null references orders(id) on delete cascade,
  revision_number  int  not null,
  subtotal         integer not null default 0,
  discount         integer not null default 0,
  total            integer not null default 0,
  reason           text not null default '',
  changed_by       text references profiles(id) on delete set null,
  changed_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (order_id, revision_number)
);

create table if not exists order_revision_items (
  id                text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  revision_id       text not null references order_revisions(id) on delete cascade,
  product_id        text references products(id) on delete set null,
  product_name      text not null,
  product_barcode   text not null,
  quantity          int  not null check (quantity > 0),
  unit_price        integer not null check (unit_price >= 0),
  price_tier        text not null default 'Normal',
  custom_price      integer,
  discount_percent  numeric(5,2) not null default 0,
  subtotal          integer not null check (subtotal >= 0)
);

create table if not exists surat_jalans (
  id              text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  order_id        text not null unique references orders(id) on delete cascade,
  no              text not null,                       
  tanggal         date not null,
  pengirim        text not null default '',
  penerima        text not null default '',
  estimasi        text not null default '',
  nama_pengirim   text not null default '',
  kendaraan       text not null default '',
  catatan         text not null default '',
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists stock_movements (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  product_id    text not null references products(id) on delete cascade,
  type          text not null,
  quantity      int not null,                          
  reference     text not null default '',              
  notes         text,
  created_by    text references profiles(id) on delete set null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (quantity <> 0)
);

create table if not exists documents (
  id            text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  order_id      text not null references orders(id) on delete cascade,
  type          text not null,
  number        text not null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists settings (
  key           text primary key,
  value         text not null,
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists agent_approvals (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id text not null references profiles(id) on delete cascade,
  tool_name text not null,
  params text not null,
  fingerprint text not null,
  summary text not null,
  impact text not null,
  irreversible integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now','+15 minutes'))
);

create table if not exists ai_providers (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  provider_id text not null unique,            
  display_name text not null,
  base_url text not null,                      
  api_protocol text not null default 'openai-completions'
    check (api_protocol in ('openai-completions')),
  api_key text not null,
  models text not null default '[]',          
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists ai_settings (
  id integer primary key default 1,            
  provider_id text not null references ai_providers(provider_id) on delete restrict,
  model_id text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

ALTER TABLE products ADD COLUMN cost_price integer NOT NULL DEFAULT 0 CHECK(cost_price >= 0);
ALTER TABLE products ADD COLUMN image_path text;
ALTER TABLE order_items ADD COLUMN cost_price integer NOT NULL DEFAULT 0 CHECK(cost_price >= 0);
ALTER TABLE orders ADD COLUMN archived integer NOT NULL DEFAULT 0;
ALTER TABLE ai_providers ADD COLUMN enabled integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX uq_product_default_price ON product_prices(product_id) WHERE is_default = 1;
CREATE UNIQUE INDEX uq_products_barcode_nonempty ON products(lower(trim(barcode))) WHERE trim(barcode) <> '';
CREATE UNIQUE INDEX uq_categories_name_level ON categories(lower(trim(name)),coalesce(level,''));
CREATE INDEX orders_date_idx ON orders(order_date DESC,id);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX movements_product_idx ON stock_movements(product_id,created_at DESC);
CREATE INDEX movements_reference_idx ON stock_movements(reference,type);
CREATE INDEX prices_product_idx ON product_prices(product_id);
CREATE INDEX approvals_owner_idx ON agent_approvals(user_id,status,created_at DESC);
CREATE TABLE migration_state (id integer PRIMARY KEY CHECK(id=1), verified integer NOT NULL DEFAULT 0, imported_at text);
INSERT INTO migration_state(id) VALUES(1);
