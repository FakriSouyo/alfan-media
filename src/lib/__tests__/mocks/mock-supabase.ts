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
      single: async () => {
        this.record("select.single", table, {
          columns: selectState.columns,
          filters: selectState.filters,
        });
        const rows = enrich(applyOrder(applyFilters(store())));
        if (rows.length === 0) {
          return err({ code: "PGRST116", message: "The result contains 0 rows", details: "", hint: "" });
        }
        return ok(rows[0]);
      },
      maybeSingle: async () => {
        const rows = enrich(applyOrder(applyFilters(store())));
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
            return ok(enrich(applyOrder(applyFilters(store()))));
          })
          .then(resolve, reject);
      },
    };

    return builder;
  }

  rpc(name: string): Promise<{ data: unknown; error: unknown }> {
    const record = () => this.record("rpc", name, {});
    return Promise.resolve().then(() => {
      record();
      if (this.rpcFail) {
        return { data: null, error: { message: `rpc_failed: ${name}` } };
      }
      if (name === "next_invoice_no" && this.rpcImpl) {
        return { data: this.rpcImpl("next_invoice_no"), error: null };
      }
      return { data: null, error: { message: `rpc_not_implemented: ${name}` } };
    });
  }
}