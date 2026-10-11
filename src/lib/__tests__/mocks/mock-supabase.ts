/* Mock Supabase client + fake DB in-memory untuk menguji alur logika
 * StoreProvider/Store API tanpa koneksi jaringan.
 *
 * Meniru kontrak supabase-js yang dipakai aplikasi:
 *   - supabase.from(t).select("*")            -> awaitable, {data: Row[], error}
 *   - ... .order(col, {ascending}).eq(c, v)   -> filter & sort
 *   - ... .select(cols).single() / .maybeSingle()
 *     (mendukung embedded resource: "id, items:order_items(*)")
 *   - supabase.from(t).insert(rows)           -> awaitable BULK atau tunggal
 *   - ... .insert(rows).select().single()     -> hasil insert (dengan id uuid)
 *   - supabase.from(t).update(patch).eq(c, v) -> awaitable
 *   - supabase.from(t).delete().eq(c, v)      -> awaitable
 *   - supabase.rpc(name)                      -> next_invoice_no (bisa dipaksa gagal)
 *
 * Selain itu mock ini MEMVALIDASI skema DB (mirip Postgres) agar bug kelas
 * "nilai yang dikirim UI ditolak DB" (enum 22P02, uuid, date, int, CHECK)
 * langsung terbentur di test:
 *   - enum: products.semester, orders.status, stock_movements.type, documents.type
 *   - uuid: semua kolom PK/FK (tidak boleh string kosong/bentuk lain)
 *   - date: orders.order_date, surat_jalans.tanggal (format YYYY-MM-DD)
 *   - integer: kolom numerik harus integer
 *   - CHECK: order_items.quantity > 0, stock_movements.quantity <> 0,
 *     discount_percent 0..100, price/subtotal/total/stock >= 0
 * Catatan: categories.level sudah text (sejak migration 007) — label bebas
 * seperti "SD I" valid.
 */

export type Row = Record<string, unknown>;

// ─── Bentuk query builder mock (thenable, self-referential) ──────────────────
type QueryResult = { data: unknown; error: unknown };

/** Node thenable hasil insert/update/delete (di-await atau di-chain). */
interface ThenableNode {
  then(resolve: (v: unknown) => void, reject: (e: unknown) => void): void;
}

/** Hasil .select() pada node insert: thenable + .single(). */
interface InsertSelectNode extends ThenableNode {
  single(): Promise<QueryResult>;
}

/** Node insert: thenable + .select(). */
interface InsertNode extends ThenableNode {
  select(): InsertSelectNode;
}

/** Node update: bisa di-filter .eq() lalu .select(). */
interface UpdateNode extends ThenableNode {
  eq(col: string, val: unknown): UpdateNode;
  select(): UpdateNode;
}

/** Node delete: bisa di-filter .eq()/.in() lalu .select(). */
interface DeleteNode extends ThenableNode {
  eq(col: string, val: unknown): DeleteNode;
  in(col: string, vals: unknown[]): DeleteNode;
  select(): DeleteNode;
}

/** Bentuk builder utuh dari from(table) — thenable + chainable. */
interface TableBuilder extends ThenableNode {
  select(cols?: string): TableBuilder;
  order(col: string, opts?: { ascending?: boolean }): TableBuilder;
  eq(col: string, val: unknown): TableBuilder;
  in(col: string, vals: unknown[]): TableBuilder;
  ilike(col: string, pattern: string): TableBuilder;
  gte(col: string, val: unknown): TableBuilder;
  lte(col: string, val: unknown): TableBuilder;
  or(spec: string): TableBuilder;
  limit(n: number): TableBuilder;
  range(from: number, to: number): TableBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
  insert(rowsVal: Row | Row[]): InsertNode;
  update(patch: Row): UpdateNode;
  delete(): DeleteNode;
}

// ─── Definisi skema (harus mengikuti supabase/migration/*.sql) ─────────────
const ENUM_COLUMNS: Record<string, Record<string, readonly string[]>> = {
  products: { semester: ["Ganjil", "Genap"] },
  orders: { status: ["DRAFT", "CHECKED_OUT", "COMPLETED", "CANCELLED"] },
  stock_movements: { type: ["INITIAL", "SALE", "ADJUSTMENT", "RETURN", "CANCELLED_ORDER"] },
  documents: { type: ["NOTA", "SURAT_JALAN"] },
};

const UUID_COLUMNS: Record<string, readonly string[]> = {
  categories: ["id"],
  products: ["id", "category_id"],
  product_prices: ["id", "product_id"],
  customers: ["id"],
  orders: ["id", "customer_id", "created_by"],
  order_items: ["id", "order_id", "product_id"],
  stock_movements: ["id", "product_id", "created_by"],
  surat_jalans: ["id", "order_id"],
  documents: ["id", "order_id"],
  profiles: ["id"],
};

const DATE_COLUMNS: Record<string, readonly string[]> = {
  orders: ["order_date"],
  surat_jalans: ["tanggal"],
};

const INT_COLUMNS: Record<string, readonly string[]> = {
  products: ["published_year", "stock", "cost_price"],
  product_prices: ["price"],
  orders: ["subtotal", "discount", "total"],
  order_items: ["quantity", "unit_price", "subtotal", "cost_price"],
  stock_movements: ["quantity"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Numeric-aware comparison for gte/lte. ISO date strings sort lexicographically. */
function cmpNumeric(a: unknown, b: unknown, op: (x: number | string, y: number | string) => boolean): boolean {
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return op(na, nb);
  return op(String(a ?? ""), String(b ?? ""));
}

/** Validasi satu baris/patch terhadap skema. Returns error PG-style atau null. */
function validateRow(table: string, row: Row): { code: string; message: string } | null {
  for (const [col, allowed] of Object.entries(ENUM_COLUMNS[table] ?? {})) {
    const v = row[col];
    if (v !== undefined && v !== null && !allowed.includes(String(v))) {
      return {
        code: "22P02",
        message: `invalid input value for enum ${col}: ${JSON.stringify(String(v))}`,
      };
    }
  }
  for (const col of UUID_COLUMNS[table] ?? []) {
    const v = row[col];
    if (v !== undefined && v !== null && (typeof v !== "string" || !UUID_RE.test(v))) {
      return {
        code: "22P02",
        message: `invalid input syntax for type uuid: ${JSON.stringify(v)}`,
      };
    }
  }
  for (const col of DATE_COLUMNS[table] ?? []) {
    const v = row[col];
    if (v !== undefined && v !== null && (typeof v !== "string" || !DATE_RE.test(v))) {
      return {
        code: "22P02",
        message: `invalid input syntax for type date: ${JSON.stringify(v)}`,
      };
    }
  }
  for (const col of INT_COLUMNS[table] ?? []) {
    const v = row[col];
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isInteger(v))) {
      return {
        code: "42882",
        message: `invalid input syntax for type integer: ${JSON.stringify(v)}`,
      };
    }
  }
  // CHECK constraints
  const chk = (col: string, ok: (v: number) => boolean, desc: string) => {
    const v = row[col];
    if (v !== undefined && v !== null && typeof v === "number" && !ok(v)) {
      return { code: "23514", message: `new row violates check constraint: ${desc}` };
    }
    return null;
  };
  // `chk` sudah menutup `row` lewat closure — tiap pengecek tak butuh parameter.
  const checks: (() => { code: string; message: string } | null)[] = [];
  if (table === "order_items") {
    checks.push(() => chk("quantity", (v) => v > 0, "order_items_quantity_positive"));
    checks.push(() => chk("unit_price", (v) => v >= 0, "unit_price_non_negative"));
    checks.push(() => chk("subtotal", (v) => v >= 0, "order_items_subtotal_non_negative"));
    checks.push(() => chk("discount_percent", (v) => v >= 0 && v <= 100, "discount_percent_0_100"));
  }
  if (table === "stock_movements") {
    checks.push(() => chk("quantity", (v) => v !== 0, "stock_movements_quantity_not_zero"));
  }
  if (table === "products") {
    checks.push(() => chk("stock", (v) => v >= 0, "products_stock_non_negative"));
  }
  if (table === "product_prices") {
    checks.push(() => chk("price", (v) => v >= 0, "price_non_negative"));
  }
  if (table === "orders") {
    checks.push(() => chk("total", (v) => v >= 0, "orders_total_non_negative"));
    checks.push(() => chk("subtotal", (v) => v >= 0, "orders_subtotal_non_negative"));
    checks.push(() => chk("discount", (v) => v >= 0, "orders_discount_non_negative"));
  }
  for (const c of checks) {
    const e = c();
    if (e) return e;
  }
  return null;
}

export class MockSupabase {
  tables: Record<string, Row[]>;
  calls: { op: string; table: string; args: unknown }[] = [];
  rpcImpl?: (name: string) => string;
  /** Kalau true, semua rpc() mengembalikan error (untuk uji fallback). */
  rpcFail = false;
  failSelectTable: string | null = null;
  /**
   * Kalau true, mock mensimulasikan perilaku DB sungguhan yang tidak dimiliki
   * mock lama: trigger sync_product_stock (movement → products.stock) dan
   * FK cascade products → product_prices/stock_movements. Off by default agar
   * test lama tidak berubah perilaku.
   */
  simulateDbBehavior = false;

  constructor(seed: Record<string, Row[]>, rpcImpl?: (name: string) => string) {
    this.tables = {};
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
    this.rpcImpl = rpcImpl;
  }

  /** Isi ulang semua tabel + kosongkan log panggilan (dipakai antar-test). */
  reset(seed: Record<string, Row[]>) {
    for (const k of Object.keys(this.tables)) delete this.tables[k];
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
    this.calls = [];
    this.failSelectTable = null;
  }

  private record(op: string, table: string, args: unknown) {
    this.calls.push({ op, table, args });
  }

  from(table: string) {
    const store = () => this.tables[table] ?? (this.tables[table] = []);
    const err = (e: unknown) => ({ data: null, error: e });
    const ok = (data: unknown) => ({ data, error: null });

    type Filter =
      | { kind: "eq"; col: string; val: unknown }
      | { kind: "in"; col: string; vals: unknown[] }
      | { kind: "ilike"; col: string; pattern: string }
      | { kind: "gte"; col: string; val: unknown }
      | { kind: "lte"; col: string; val: unknown }
      | { kind: "or"; terms: Filter[] };

    const selectState = {
      columns: "*" as string,
      filters: [] as Filter[],
      orderBy: [] as { col: string; asc: boolean }[],
      limitN: undefined as number | undefined,
      range: undefined as { from: number; to: number } | undefined,
    };

    const parseOr = (spec: string): Filter[] =>
      spec
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          const m = t.match(/^([A-Za-z_]\w*)\.(eq|ilike)\.(.*)$/);
          if (!m) return { kind: "eq" as const, col: "", val: null };
          return m[2] === "ilike"
            ? { kind: "ilike" as const, col: m[1], pattern: m[3] }
            : { kind: "eq" as const, col: m[1], val: m[3] };
        });

    const matchFilter = (row: Row, f: Filter): boolean => {
      switch (f.kind) {
        case "eq":
          return row[f.col] === f.val;
        case "in":
          return f.vals.includes(row[f.col]);
        case "ilike": {
          const v = String(row[f.col] ?? "");
          const rx = new RegExp(
            "^" + f.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$",
            "i",
          );
          return rx.test(v);
        }
        case "gte":
          return cmpNumeric(row[f.col], f.val, (a, b) => a >= b);
        case "lte":
          return cmpNumeric(row[f.col], f.val, (a, b) => a <= b);
        case "or":
          return f.terms.some((t) => matchFilter(row, t));
      }
    };

    const applyFilters = (rows: Row[]) => {
      let r = rows.slice();
      for (const f of selectState.filters) r = r.filter((x) => matchFilter(x, f));
      if (selectState.limitN !== undefined) r = r.slice(0, selectState.limitN);
      return r;
    };
    const applyOrder = (rows: Row[]) => {
      let r = rows.slice();
      for (const ob of selectState.orderBy) {
        const { col, asc } = ob;
        r = r.sort((a, b) => {
          const av: unknown = a[col];
          const bv: unknown = b[col];
          if (av === undefined || av === null || bv === undefined || bv === null) return 0;
          const sa = String(av);
          const sb = String(bv);
          if (sa < sb) return asc ? -1 : 1;
          if (sa > sb) return asc ? 1 : -1;
          return 0;
        });
      }
      return r;
    };
    const applyResult = (rows: Row[]) => {
      let result = applyOrder(applyFilters(rows));
      if (selectState.range) result = result.slice(selectState.range.from, selectState.range.to + 1);
      return result;
    };
    // "id, items:order_items(*)" -> [{alias: "items", table: "order_items"}]
    const parseEmbeds = (cols: string) => {
      const out: { alias: string; table: string }[] = [];
      const re = /([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)\s*\((.*?)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cols))) out.push({ alias: m[1], table: m[2] });
      return out;
    };
    const enrich = (rows: Row[]) => {
      const embeds = parseEmbeds(selectState.columns);
      if (embeds.length === 0) return rows.map((r) => ({ ...r }));
      return rows.map((r) => {
        const o = { ...r };
        for (const e of embeds) {
          o[e.alias] = (this.tables[e.table] ?? []).filter((x) => x.order_id === r.id);
        }
        return o;
      });
    };

    const builder: TableBuilder = {
      select(cols?: string) {
        if (cols && cols !== "*") selectState.columns = cols;
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        selectState.orderBy.push({ col, asc: opts?.ascending ?? true });
        return builder;
      },
      eq(col: string, val: unknown) {
        selectState.filters.push({ kind: "eq", col, val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        selectState.filters.push({ kind: "in", col, vals });
        return builder;
      },
      ilike(col: string, pattern: string) {
        selectState.filters.push({ kind: "ilike", col, pattern });
        return builder;
      },
      gte(col: string, val: unknown) {
        selectState.filters.push({ kind: "gte", col, val });
        return builder;
      },
      lte(col: string, val: unknown) {
        selectState.filters.push({ kind: "lte", col, val });
        return builder;
      },
      or(spec: string) {
        selectState.filters.push({ kind: "or", terms: parseOr(spec) });
        return builder;
      },
      limit(n: number) {
        selectState.limitN = n;
        return builder;
      },
      range(from: number, to: number) {
        selectState.range = { from, to };
        return builder;
      },
      single: async () => {
        this.record("select.single", table, {
          columns: selectState.columns,
          filters: selectState.filters,
        });
        const rows = enrich(applyResult(store()));
        if (rows.length === 0) {
          return err({ code: "PGRST116", message: "The result contains 0 rows", details: "", hint: "" });
        }
        return ok(rows[0]);
      },
      maybeSingle: async () => {
        const rows = enrich(applyResult(store()));
        return ok(rows[0] ?? null);
      },
      insert: (rowsVal: Row | Row[]) => {
        const list = Array.isArray(rowsVal) ? rowsVal : [rowsVal];
        let didRun = false;
        const run = async () => {
          if (didRun) {
            const rows = store();
            return ok(rows[rows.length - 1]);
          }
          didRun = true;
          const inserted = list.map((r) => ({ ...r }));
          // Simulasikan default DB: id uuid yang digenerate server.
          for (const r of inserted) {
            if (r.id === undefined && table !== "settings") r.id = crypto.randomUUID();
          }
          // Validasi skema (enum/uuid/date/int/CHECK) — seperti Postgres.
          for (const r of inserted) {
            const e = validateRow(table, r);
            if (e) return err(e);
          }
          this.record("insert", table, inserted);
          store().push(...inserted);
          // Trigger sync_product_stock (opsional, lihat simulateDbBehavior).
          // Semantik RIIL (004_triggers.sql): products.stock =
          // greatest(0, SUM(stock_movements.quantity)) — ledger yang
          // negatif (penjualan melebihi stok tercatat) tampil sebagai 0.
          if (this.simulateDbBehavior && table === "stock_movements") {
            for (const m of inserted) {
              const p = (this.tables["products"] ?? []).find(
                (x) => x.id === m.product_id,
              );
              if (p) {
                const sum = (this.tables["stock_movements"] ?? []).reduce(
                  (s, row) => (row.product_id === m.product_id ? s + Number(row.quantity ?? 0) : s),
                  0,
                );
                const next = Math.max(0, sum);
                const e = validateRow("products", { ...p, stock: next });
                if (e) throw new Error(`trigger: ${e.message}`);
                p.stock = next;
              }
            }
          }
          return ok(inserted[0]);
        };
        const node: InsertNode = {
          select: () => {
            // `insert().select(cols)` (tanpa .single()) juga harus awaitable.
            const t: InsertSelectNode = { single: run, then: node.then };
            return t;
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            Promise.resolve()
              .then(run)
              .then(resolve, reject);
          },
        };
        return node;
      },
      update: (patch: Row) => {
        const state: { filters: { col: string; val: unknown }[]; selecting: boolean } = {
          filters: [],
          selecting: false,
        };
        const matches = (r: Row) =>
          state.filters.every((f) => r[f.col] === f.val);
        const run = async () => {
          this.record("update", table, { patch, filters: state.filters });
          const targets = store().filter(matches);
          for (const r of targets) {
            const merged = { ...r, ...patch };
            const e = validateRow(table, merged);
            if (e) return err(e);
          }
          for (const r of targets) Object.assign(r, patch);
          return ok(state.selecting ? targets : null);
        };
        const node: UpdateNode = {
          eq: (col: string, val: unknown) => {
            state.filters.push({ col, val });
            return node;
          },
          select: () => {
            state.selecting = true;
            return node;
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            Promise.resolve()
              .then(run)
              .then(resolve, reject);
          },
        };
        return node;
      },
      delete: () => {
        type DelFilter = { kind: "eq"; col: string; val: unknown } | { kind: "in"; col: string; vals: unknown[] };
        const state: { filters: DelFilter[]; selecting: boolean } = {
          filters: [],
          selecting: false,
        };
        const matches = (r: Row) =>
          state.filters.every((f) =>
            f.kind === "eq" ? r[f.col] === f.val : f.vals.includes(r[f.col]),
          );
        const run = async () => {
          this.record("delete", table, { filters: state.filters, selecting: state.selecting });
          const rows = store();
          const deleted = rows.filter(matches);
          if (deleted.length > 0) {
            rows.splice(0, rows.length, ...rows.filter((r) => !matches(r)));
          }
          // FK cascade (opsional, lihat simulateDbBehavior).
          if (this.simulateDbBehavior && table === "products" && deleted.length > 0) {
            const ids = new Set(deleted.map((d) => d.id));
            const pp = this.tables["product_prices"];
            if (pp) this.tables["product_prices"] = pp.filter((x) => !ids.has(x.product_id));
            const sm = this.tables["stock_movements"];
            if (sm) this.tables["stock_movements"] = sm.filter((x) => !ids.has(x.product_id));
          }
          return ok(state.selecting ? deleted : null);
        };
        const node: DeleteNode = {
          eq: (col: string, val: unknown) => {
            state.filters.push({ kind: "eq", col, val });
            return node;
          },
          in: (col: string, vals: unknown[]) => {
            state.filters.push({ kind: "in", col, vals });
            return node;
          },
          select: () => {
            state.selecting = true;
            return node;
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve().then(run).then(resolve, reject),
        };
        return node;
      },
      // `await supabase.from(t).select("*")` — thenable (diambil oleh Promise.all).
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        Promise.resolve()
          .then(() => {
            this.record("select", table, {
              columns: selectState.columns,
              filters: selectState.filters,
              orderBy: selectState.orderBy,
            });
            if (this.failSelectTable === table) return err({ message: "select_failed: " + table });
            return ok(enrich(applyResult(store())));
          })
          .then(resolve, reject);
      },
    };

    return builder;
  }

  private createMovement(productId: string, type: string, quantity: number, reference: string) {
    const movement = { id: crypto.randomUUID(), product_id: productId, type, quantity, reference, notes: null, created_by: null, created_at: "2026-01-01" };
    this.tables.stock_movements ??= [];
    this.record("insert", "stock_movements", [movement]);
    this.tables.stock_movements.push(movement);
    if (this.simulateDbBehavior) {
      const product = (this.tables.products ?? []).find((row) => row.id === productId);
      if (product) product.stock = Math.max(0, (this.tables.stock_movements ?? []).filter((row) => row.product_id === productId).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0));
    }
  }

  private nextInvoice() {
    const numbers = (this.tables.orders ?? []).map((row) => /^INV-(\d+)$/.exec(String(row.invoice_no))?.[1]).filter(Boolean).map(Number);
    return `INV-${String(Math.max(0, ...numbers) + 1).padStart(3, "0")}`;
  }

  private applyOrderStock(order: Row, action: "SALE" | "RETURN"): { error: unknown } | null {
    const invoice = String(order.invoice_no);
    const orderItems = (this.tables.order_items ?? []).filter((row) => row.order_id === order.id);
    const required = new Map<string, number>();
    for (const item of orderItems) {
      const productId = String(item.product_id ?? "");
      if (!productId) continue;
      required.set(productId, (required.get(productId) ?? 0) + Number(item.quantity));
    }
    const saleRows = (this.tables.stock_movements ?? []).filter((row) => row.reference === invoice && row.type === "SALE");
    const targetRows = (this.tables.stock_movements ?? []).filter((row) => row.reference === invoice && row.type === action);
    if (action === "SALE" && saleRows.length) return null;
    if (action === "RETURN" && targetRows.length) return null;
    if (action === "RETURN" && saleRows.length === 0) return null;
    if (action === "SALE") {
      for (const [productId, quantity] of required) {
        const product = (this.tables.products ?? []).find((row) => row.id === productId);
        if (!product || Number(product.stock ?? 0) < quantity) return { error: { code: "P0001", message: "insufficient stock" } };
      }
      if (orderItems.some((item) => !item.product_id)) return { error: { code: "P0001", message: "item has no product reference" } };
      if (!required.size) return { error: { code: "P0001", message: "empty order" } };
    }
    for (const [productId, quantity] of required) this.createMovement(productId, action, action === "SALE" ? -quantity : quantity, invoice);
    return null;
  }

  rpc(name: string, args: Row = {}): Promise<{ data: unknown; error: unknown }> {
    const record = () => this.record("rpc", name, args);
    return Promise.resolve().then(() => {
      record();
      if (this.rpcFail) {
        return { data: null, error: { message: `rpc_failed: ${name}` } };
      }
      if (name === "next_invoice_no" && this.rpcImpl) {
        return { data: this.rpcImpl("next_invoice_no"), error: null };
      }
      if (name === "create_order_atomic") {
        const source = args.p_order as Row;
        const incoming = args.p_items as Row[];
        const status = String(source.status ?? "DRAFT");
        if (!Array.isArray(incoming) || incoming.length === 0) return { data: null, error: { message: "Order must contain at least one item" } };
        const invoice = this.nextInvoice();
        const order: Row = {
          id: crypto.randomUUID(), invoice_no: invoice, order_date: source.order_date,
          customer_id: source.customer_id || null, customer_name: source.customer_name,
          subtotal: source.subtotal, discount: source.discount, total: source.total,
          status: "DRAFT", archived: false, notes: null, created_by: null,
          created_at: "2026-01-01", updated_at: "2026-01-01",
        };
        const orderItems = incoming.map((item) => ({
          id: crypto.randomUUID(), order_id: order.id, product_id: item.product_id || null,
          product_name: item.product_name, product_barcode: item.product_barcode ?? "",
          quantity: item.quantity, unit_price: item.unit_price, price_tier: item.price_tier ?? "Normal",
          custom_price: item.custom_price, discount_percent: item.discount_percent,
          subtotal: item.subtotal, cost_price: item.cost_price ?? 0, created_at: "2026-01-01",
        }));
        const e = validateRow("orders", order) ?? orderItems.map((item) => validateRow("order_items", item)).find(Boolean);
        if (e) return { data: null, error: e };
        this.tables.orders ??= [];
        this.tables.order_items ??= [];
        this.tables.surat_jalans ??= [];
        this.tables.stock_movements ??= [];
        const previous = { orders: [...this.tables.orders], order_items: [...this.tables.order_items], surat_jalans: [...this.tables.surat_jalans], stock_movements: [...this.tables.stock_movements] };
        this.tables.orders.push(order);
        this.tables.order_items.push(...orderItems);
        this.record("insert", "orders", [order]);
        this.record("insert", "order_items", orderItems);
        const delivery = args.p_surat_jalan as Row | null;
        if (delivery) {
          const suratJalan = { id: crypto.randomUUID(), order_id: order.id, no: delivery.no ?? "", tanggal: delivery.tanggal || source.order_date, pengirim: delivery.pengirim ?? "", penerima: delivery.penerima ?? "", estimasi: delivery.estimasi ?? "", nama_pengirim: delivery.nama_pengirim ?? "", kendaraan: delivery.kendaraan ?? "", catatan: delivery.catatan ?? "" };
          this.tables.surat_jalans.push(suratJalan);
          this.record("insert", "surat_jalans", [suratJalan]);
        }
        if (status === "CHECKED_OUT") {
          const stockError = this.applyOrderStock(order, "SALE");
          if (stockError) {
            this.tables.orders = previous.orders; this.tables.order_items = previous.order_items;
            this.tables.surat_jalans = previous.surat_jalans; this.tables.stock_movements = previous.stock_movements;
            return { data: null, error: stockError.error };
          }
          order.status = "CHECKED_OUT";
        }
        return { data: order, error: null };
      }
      if (name === "transition_order_atomic") {
        const order = (this.tables.orders ?? []).find((row) => row.invoice_no === args.p_invoice_no);
        if (!order) return { data: false, error: null };
        const target = String(args.p_target);
        if (target === "CHECKED_OUT" && order.status === "DRAFT") {
          const stockError = this.applyOrderStock(order, "SALE");
          if (stockError) return { data: null, error: stockError.error };
        } else if (target === "COMPLETED" && order.status === "CHECKED_OUT") {
          const stockError = this.applyOrderStock(order, "SALE");
          if (stockError) return { data: null, error: stockError.error };
        } else if (target === "CANCELLED" && order.status === "CHECKED_OUT") {
          const stockError = this.applyOrderStock(order, "RETURN");
          if (stockError) return { data: null, error: stockError.error };
        } else if ((target === "CHECKED_OUT" && order.status === "CHECKED_OUT") || (target === "COMPLETED" && order.status === "COMPLETED") || (target === "CANCELLED" && order.status === "CANCELLED")) {
          return { data: true, error: null };
        } else if (target === "CANCELLED" && order.status === "DRAFT") {
          // Draft cancellation has no stock effect.
        } else {
          return { data: false, error: null };
        }
        order.status = target;
        return { data: true, error: null };
      }
      if (name === "delete_order_atomic") {
        const index = (this.tables.orders ?? []).findIndex((row) => row.invoice_no === args.p_invoice_no);
        if (index < 0) return { data: false, error: null };
        const orderMovementTypes = ["SALE", "RETURN", "CANCELLED_ORDER"];
        this.record("delete", "stock_movements", { filters: [{ kind: "eq", col: "reference", val: args.p_invoice_no }, { kind: "in", col: "type", vals: orderMovementTypes }] });
        const removedMovements = (this.tables.stock_movements ?? []).filter((row) => row.reference === args.p_invoice_no && orderMovementTypes.includes(String(row.type)));
        this.tables.stock_movements = (this.tables.stock_movements ?? []).filter((row) => !(row.reference === args.p_invoice_no && orderMovementTypes.includes(String(row.type))));
        if (this.simulateDbBehavior) {
          for (const productId of new Set(removedMovements.map((row) => String(row.product_id)))) {
            const product = (this.tables.products ?? []).find((row) => row.id === productId);
            if (product) product.stock = Math.max(0, (this.tables.stock_movements ?? []).filter((row) => row.product_id === productId).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0));
          }
        }
        const [deleted] = this.tables.orders.splice(index, 1);
        this.record("delete", "orders", { filters: [{ kind: "eq", col: "id", val: deleted.id }] });
        this.tables.order_items = (this.tables.order_items ?? []).filter((row) => row.order_id !== deleted.id);
        this.tables.surat_jalans = (this.tables.surat_jalans ?? []).filter((row) => row.order_id !== deleted.id);
        return { data: true, error: null };
      }
      if (name === "create_product_atomic") {
        const source = args.p_product as Row;
        const prices = args.p_prices as Row[];
        const product: Row = { id: crypto.randomUUID(), name: source.name, category_id: source.category_id || null, barcode: source.barcode ?? "", description: source.description ?? "", published_year: source.published_year, semester: source.semester ?? "Ganjil", stock: 0, cost_price: source.cost_price ?? 0, image_path: source.image_path || null, created_at: "2026-01-01", updated_at: "2026-01-01" };
        const e = validateRow("products", product);
        if (e) return { data: null, error: e };
        if (String(product.barcode).trim() && (this.tables.products ?? []).some((row) => String(row.barcode).trim().toLowerCase() === String(product.barcode).trim().toLowerCase())) return { data: null, error: { code: "23505", message: "duplicate barcode" } };
        const priceRows = prices.map((price) => ({ id: crypto.randomUUID(), product_id: product.id, tier_name: price.tier_name, price: price.price, is_default: price.is_default, created_at: "2026-01-01", updated_at: "2026-01-01" }));
        const duplicateTiers = new Set(priceRows.map((row) => row.tier_name)).size !== priceRows.length;
        const priceError = priceRows.map((row) => validateRow("product_prices", row)).find(Boolean);
        if (duplicateTiers || priceError) return { data: null, error: priceError ?? { code: "23505", message: "duplicate product price tier" } };
        this.tables.products ??= []; this.tables.products.push(product);
        this.tables.product_prices ??= []; this.tables.product_prices.push(...priceRows);
        this.record("insert", "products", [product]);
        this.record("insert", "product_prices", priceRows);
        if (Number(args.p_initial_stock) > 0) {
          this.createMovement(String(product.id), "INITIAL", Number(args.p_initial_stock), "Stock awal");
          product.stock = Number(args.p_initial_stock);
        }
        return { data: product, error: null };
      }
      if (name === "update_product_atomic") {
        const product = (this.tables.products ?? []).find((row) => row.id === args.p_id);
        if (!product) return { data: false, error: null };
        const patch = args.p_patch as Row;
        const updated = { ...product, ...patch };
        const productError = validateRow("products", updated);
        if (productError) return { data: null, error: productError };
        let priceRows = [...(this.tables.product_prices ?? [])];
        if (args.p_prices !== null) {
          const incoming = args.p_prices as Row[];
          const names = incoming.map((row) => String(row.tier_name));
          if (new Set(names).size !== names.length || incoming.filter((row) => row.is_default).length > 1) return { data: null, error: { code: "23505", message: "duplicate product price tier or default" } };
          const replacements = incoming.map((price) => ({ id: (priceRows.find((row) => row.product_id === args.p_id && row.tier_name === price.tier_name)?.id as string | undefined) ?? crypto.randomUUID(), product_id: args.p_id, tier_name: price.tier_name, price: price.price, is_default: price.is_default, created_at: "2026-01-01", updated_at: "2026-01-01" }));
          const priceError = replacements.map((row) => validateRow("product_prices", row)).find(Boolean);
          if (priceError) return { data: null, error: priceError };
          priceRows = priceRows.filter((row) => row.product_id !== args.p_id).concat(replacements);
        }
        Object.assign(product, updated);
        this.record("update", "products", { patch, filters: [{ col: "id", val: args.p_id }] });
        if (args.p_prices !== null) this.record("replace", "product_prices", { product_id: args.p_id, rows: args.p_prices });
        this.tables.product_prices = priceRows;
        return { data: true, error: null };
      }
      return { data: null, error: { message: `rpc_not_implemented: ${name}` } };
    });
  }
}
