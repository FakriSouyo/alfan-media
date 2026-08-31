/* Uji seluruh alur (flow) StoreProvider:
 *   - initial refresh (pemetaan baris DB → tipe app)
 *   - kategori: tambah / edit / hapus
 *   - produk: tambah (stok awal → movement INITIAL, bug pasca-migrasi),
 *     edit, hapus
 *   - pelanggan: tambah
 *   - pesanan: invoice (RPC + fallback), tambah order + items + surat jalan,
 *     updateOrder, updateSuratJalan (insert lalu update),
 *     alur DRAFT →(checkoutOrder, SALE movement)→ CHECKED_OUT →
 *     (completeOrder)→ COMPLETED (final), cancelOrder (RETURN bila terpotong),
 *     archiveOrder, adjustStock
 *
 * Strategi: mount StoreProvider SEKALI (beforeAll), lalu antar-test DB mock
 * di-reset + refresh() supaya state konsisten. Ini menghindari masalah
 * isolasi saat mount ulang komponen stateful penuh.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, waitFor, act, cleanup } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store-context";
import { MockSupabase, type Row } from "./mocks/mock-supabase";

type StoreValue = ReturnType<typeof useStore>;

// Mock browser client agar StoreProvider memakai fake DB (bukan createBrowserClient
// sungguhan yang butuh env NEXT_PUBLIC_SUPABASE_URL).
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => (globalThis as any).__mockSupabase,
}));

// id seed harus uuid sungguhan karena mock memvalidasi kolom uuid.
const ID = {
  c1: "11111111-1111-4111-8111-111111111111",
  p1: "22222222-2222-4222-8222-222222222222",
  pp1: "33333333-3333-4333-8333-333333333333",
  cu1: "44444444-4444-4444-8444-444444444444",
  o1: "55555555-5555-4555-8555-555555555555",
  oi1: "66666666-6666-4666-8666-666666666666",
  m1: "77777777-7777-4777-8777-777777777777",
} as const;

function seedDb(): Record<string, Row[]> {
  return {
    categories: [
      { id: ID.c1, name: "Matematika", level: "SMA", description: "", created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    products: [
      { id: ID.p1, name: "Algebra X", category_id: ID.c1, barcode: "BC1", description: "", published_year: 2025, semester: "Ganjil", stock: 10, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    product_prices: [
      { id: ID.pp1, product_id: ID.p1, tier_name: "Normal", price: 50000, is_default: true },
    ],
    customers: [
      { id: ID.cu1, name: "SMA 1", price_tier: "Sekolah", phone: null, address: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    orders: [
      { id: ID.o1, invoice_no: "INV-001", order_date: "2026-08-27", customer_id: ID.cu1, customer_name: "SMA 1", subtotal: 100000, discount: 0, total: 100000, status: "CHECKED_OUT", notes: null, created_by: null, created_at: "2026-08-27", updated_at: "2026-08-27" },
    ],
    order_items: [
      { id: ID.oi1, order_id: ID.o1, product_id: ID.p1, product_name: "Algebra X", product_barcode: "BC1", quantity: 2, unit_price: 50000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: 100000, created_at: "2026-08-27" },
    ],
    stock_movements: [
      { id: ID.m1, product_id: ID.p1, type: "INITIAL", quantity: 12, reference: "awal", notes: null, created_by: null, created_at: "2026-01-01" },
    ],
    surat_jalans: [],
    documents: [],
    settings: [{ key: "store", value: {}, updated_at: "2026-01-01" }],
    profiles: [],
  };
}

interface Holder {
  store: StoreValue | null;
}
function Harness({ holder }: { holder: Holder }) {
  const store = useStore();
  holder.store = store;
  return <div data-testid="harness" />;
}

let sb: MockSupabase;
const holder: Holder = { store: null };
const S = () => holder.store!;

// Jalankan aksi async penuh di dalam act (callback async eksplisit) sehingga
// semua await (insert/update/refresh + setState hasil re-fetch) ter-commit
// sebelum asersi berikutnya.
async function actAsync<T>(fn: () => Promise<T>): Promise<T> {
  let result: T;
  await act(async () => {
    result = await fn();
  });
  return result!;
}

// Satu-satunya mount.
beforeAll(async () => {
  sb = new MockSupabase(seedDb(), () => "INV-002");
  (globalThis as any).__mockSupabase = sb;
  await actAsync(async () => {
    render(
      <StoreProvider>
        <Harness holder={holder} />
      </StoreProvider>
    );
    await Promise.resolve();
  });
  // Beri microtask-turn di dalam act agar rantai async refresh() ter-commit.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  await waitFor(() => expect(holder.store).not.toBeNull());
  await waitFor(() => expect(holder.store!.loading).toBe(false));
});

// Setiap test: DB fresh + state di-refresh.
beforeEach(async () => {
  sb.reset(seedDb());
  await actAsync(() => S().refresh());
});

afterAll(() => {
  cleanup();
});

describe("Initial refresh (pemetaan data DB → app)", () => {
  it("memuat & memetakan categories, products(+prices), customers, orders(+items), movements", () => {
    const s = S();
    expect(s.categories).toHaveLength(1);
    expect(s.categories[0].name).toBe("Matematika");
    expect(s.products).toHaveLength(1);
    expect(s.products[0].prices).toHaveLength(1);
    expect(s.products[0].prices[0].tierName).toBe("Normal");
    expect(s.products[0].stock).toBe(10);
    expect(s.customers).toHaveLength(1);
    expect(s.orders).toHaveLength(1);
    // id order memakai invoice_no
    expect(s.orders[0].id).toBe("INV-001");
    expect(s.orders[0].items).toHaveLength(1);
    expect(s.orders[0].items[0].productName).toBe("Algebra X");
    expect(s.movements).toHaveLength(1);
    expect(s.movements[0].type).toBe("INITIAL");
  });
});

describe("Kategori", () => {
  it("addCategory: insert tabel + tambah ke state", async () => {
    const created = await actAsync(() => S().addCategory("Novel", "desk", "SMP"));
    expect(created).not.toBeNull();
    expect(created!.name).toBe("Novel");
    expect(sb.calls.some((c) => c.op === "insert" && c.table === "categories")).toBe(true);
    expect(S().categories.some((c) => c.name === "Novel")).toBe(true);
  });

  it("updateCategory: update tabel + state", async () => {
    await actAsync(() => S().updateCategory(ID.c1, "Matematika Baru", "d", "SMA II"));
    expect(sb.calls.some((c) => c.op === "update" && c.table === "categories")).toBe(true);
    expect(S().categories[0].name).toBe("Matematika Baru");
  });

  it("deleteCategory: hapus tabel + state", async () => {
    await actAsync(() => S().deleteCategory(ID.c1));
    expect(sb.calls.some((c) => c.op === "delete" && c.table === "categories")).toBe(true);
    expect(S().categories).toHaveLength(0);
  });

  // REGRESI (bug pasca-migrasi): UI mengirim label jenjang+kelas bebas
  // ("SD I", "SMP II", dst.) — dulu ditolak DB karena enum 3 nilai (22P02).
  // Setelah migration 007 (level -> text) semua label ini valid.
  it("addCategory dengan label kelas bebas (\"SD I\", \"SMP II\", ...): sukses", async () => {
    for (const level of ["SD I", "SD VI", "SMP II", "SMA III", "SD"]) {
      const created = await actAsync(() => S().addCategory("Matematika", "desk", level));
      expect(created, `level "${level}" harus diterima`).not.toBeNull();
      expect(created!.level).toBe(level);
    }
    // 5 baru + 1 seed bernama "Matematika" (level SMA) = 6
    expect(S().categories.filter((c) => c.name === "Matematika")).toHaveLength(6);
  });

  it("updateCategory dengan label kelas bebas: sukses", async () => {
    await actAsync(() => S().updateCategory(ID.c1, "Matematika", "d", "SD I"));
    expect(S().categories[0].level).toBe("SD I");
    const row = (sb.tables.categories[0] as { level?: string });
    expect(row.level).toBe("SD I");
  });
});

describe("Produk & sumber kebenaran stok", () => {
  it("addProduct (stok awal > 0): tidak menulis products.stock langsung, membuat movement INITIAL", async () => {
    const created = await actAsync(() =>
      S().addProduct({
        name: "Buku Baru", categoryId: ID.c1, barcode: "BB1", description: "",
        publishedYear: 2026, semester: "Ganjil", stock: 25,
        prices: [{ id: "x", tierName: "Normal", price: 9000, isDefault: true }],
      })
    );
    expect(created).not.toBeNull();
    // Insert produk harus stock: 0 (stok dikelola lewat movements).
    const prodInsert = sb.calls.find((c) => c.op === "insert" && c.table === "products");
    expect(prodInsert).toBeDefined();
    expect((prodInsert!.args as Row[])[0].stock).toBe(0);
    // Harus ada movement INITIAL untuk stok awal.
    const init = sb.calls.find((c) => c.op === "insert" && c.table === "stock_movements");
    expect(init).toBeDefined();
    expect((init!.args as Row[])[0].type).toBe("INITIAL");
    expect((init!.args as Row[])[0].quantity).toBe(25);
    expect(S().products.some((p) => p.name === "Buku Baru")).toBe(true);
  });

  it("addProduct (stok 0): TIDAK membuat movement INITIAL", async () => {
    await actAsync(() =>
      S().addProduct({
        name: "Buku Kosong", categoryId: ID.c1, barcode: "BB2", description: "",
        publishedYear: 2026, semester: "Genap", stock: 0,
        prices: [{ id: "y", tierName: "Normal", price: 1, isDefault: true }],
      })
    );
    expect(sb.calls.some((c) => c.op === "insert" && c.table === "stock_movements")).toBe(false);
  });

  it("updateProduct: mengubah kolom produk (tanpa menulis stock)", async () => {
    await actAsync(() => S().updateProduct(ID.p1, { name: "Algebra Y" }));
    const upd = sb.calls.find((c) => c.op === "update" && c.table === "products");
    expect(upd).toBeDefined();
    expect(S().products[0].name).toBe("Algebra Y");
  });

  it("deleteProduct: hapus produk", async () => {
    await actAsync(() => S().deleteProduct(ID.p1));
    expect(sb.calls.some((c) => c.op === "delete" && c.table === "products")).toBe(true);
    expect(S().products).toHaveLength(0);
  });
});

describe("Pelanggan", () => {
  it("addCustomer: insert + tambah state", async () => {
    const c = await actAsync(() => S().addCustomer({ name: "Toko 2", priceTier: "Normal" }));
    expect(c).not.toBeNull();
    expect(sb.calls.some((x) => x.op === "insert" && x.table === "customers")).toBe(true);
    expect(S().customers.some((x) => x.name === "Toko 2")).toBe(true);
  });
});

describe("Pesanan & invoice", () => {
  it("getNextInvoiceId memakai RPC next_invoice_no", async () => {
    const next = await actAsync(() => S().getNextInvoiceId());
    expect(next).toBe("INV-002");
    expect(sb.calls.some((c) => c.op === "rpc")).toBe(true);
  });

  it("getNextInvoiceId fallback manual saat RPC gagal", async () => {
    sb.rpcFail = true;
    try {
      const next = await actAsync(() => S().getNextInvoiceId());
      // INV-001 ada di seed → next = INV-002
      expect(next).toBe("INV-002");
    } finally {
      sb.rpcFail = false;
    }
  });

  it("addOrder: simpan order + items + surat jalan, kembalikan id invoice baru", async () => {
    const order = await actAsync(() =>
      S().addOrder({
        date: "2026-08-30", customerId: null, customerName: "Walk-in",
        items: [{ id: "x", productId: ID.p1, productName: "Algebra X", productBarcode: "BC1", quantity: 3, unitPrice: 50000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 150000 }],
        subtotal: 150000, discount: 0, total: 150000, status: "CHECKED_OUT",
        suratJalan: { no: "SJ-INV-002", tanggal: "2026-08-30", pengirim: "Toko", penerima: "Walk-in", estimasi: "", namaPengirim: "", kendaraan: "", catatan: "" },
      })
    );
    expect(order).not.toBeNull();
    expect(sb.calls.some((c) => c.op === "insert" && c.table === "orders")).toBe(true);
    expect(sb.calls.some((c) => c.op === "insert" && c.table === "order_items")).toBe(true);
    expect(sb.calls.some((c) => c.op === "insert" && c.table === "surat_jalans")).toBe(true);
    expect(order!.id).toBe("INV-002");
    expect(S().orders.find((o) => o.id === "INV-002")).toBeDefined();
  });

  it("updateOrder: update kolom order di tabel", async () => {
    await actAsync(() => S().updateOrder("INV-001", { customerName: "SMA 2", total: 99000 }));
    const upd = sb.calls.find((c) => c.op === "update" && c.table === "orders");
    expect(upd).toBeDefined();
    const patch = (upd!.args as { patch: Record<string, unknown> }).patch;
    expect(patch.customer_name).toBe("SMA 2");
    expect(patch.total).toBe(99000);
    expect(S().orders[0].customerName).toBe("SMA 2");
  });

  it("updateSuratJalan: call pertama INSERT, call kedua UPDATE, & hasil tampil di state", async () => {
    await actAsync(() => S().updateSuratJalan("INV-001", { no: "SJ-001", catatan: "hati-hati" }));
    const ins = sb.calls.find((c) => c.op === "insert" && c.table === "surat_jalans");
    expect(ins).toBeDefined();
    expect((ins!.args as Row[])[0].no).toBe("SJ-001");
    await actAsync(() => S().updateSuratJalan("INV-001", { catatan: "hati-hati banget" }));
    const upd = sb.calls.find((c) => c.op === "update" && c.table === "surat_jalans");
    expect(upd).toBeDefined();
    expect((upd!.args as { patch: Record<string, unknown> }).patch.catatan).toBe("hati-hati banget");
    // REGRESI: refresh() harus load surat_jalans kembali ke order —
    // dulu kolom ini tidak pernah di-fetch, jadi edit hilang dari UI.
    const o = S().orders.find((x) => x.id === "INV-001");
    expect(o!.suratJalan).toBeDefined();
    expect(o!.suratJalan!.catatan).toBe("hati-hati banget");
    expect(o!.suratJalan!.no).toBe("SJ-001");
  });
});

describe("Transisi status & stok", () => {
  it("completeOrder: mencatat movement SALE per item & set status COMPLETED", async () => {
    const ok = await actAsync(() => S().completeOrder("INV-001"));
    expect(ok).toBe(true);
    const movs = sb.calls.filter((c) => c.op === "insert" && c.table === "stock_movements");
    expect(movs).toHaveLength(1); // 1 item di seed
    expect((movs[0].args as Row[])[0].type).toBe("SALE");
    expect((movs[0].args as Row[])[0].quantity).toBe(-2);
    const o = S().orders.find((x) => x.id === "INV-001");
    expect(o!.status).toBe("COMPLETED");
  });

  it("completeOrder: oversell ditolak — stok kurang, tanpa movement, status utuh", async () => {
    const o2id = "55555555-5555-4555-8555-555555555502";
    sb.tables["orders"].push({ id: o2id, invoice_no: "INV-003", order_date: "2026-08-27", customer_id: null, customer_name: "X", subtotal: 4950000, discount: 0, total: 4950000, status: "CHECKED_OUT", notes: null, created_by: null, created_at: "2026-08-27", updated_at: "2026-08-27" });
    sb.tables["order_items"].push({ id: "66666666-6666-4666-8666-666666666602", order_id: o2id, product_id: ID.p1, product_name: "Algebra X", product_barcode: "BC1", quantity: 99, unit_price: 50000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: 4950000, created_at: "2026-08-27" });
    await actAsync(() => S().refresh());
    const ok = await actAsync(() => S().completeOrder("INV-003"));
    expect(ok).toBe(false);
    const saleInv3 = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].reference === "INV-003",
    );
    expect(saleInv3).toHaveLength(0);
    expect(S().orders.find((x) => x.id === "INV-003")!.status).toBe("CHECKED_OUT");
  });

  it("completeOrder diabaikan bila status bukan CHECKED_OUT", async () => {
    // Jadikan COMPLETED dulu
    await actAsync(() => S().completeOrder("INV-001"));
    const afterFirst = sb.calls.filter((c) => c.op === "insert" && c.table === "stock_movements").length;
    // Panggil lagi — harus tidak menambah movement baru
    await actAsync(() => S().completeOrder("INV-001"));
    const afterSecond = sb.calls.filter((c) => c.op === "insert" && c.table === "stock_movements").length;
    expect(afterSecond).toBe(afterFirst);
  });

  // ── Alur baru: DRAFT →(proses, stok terpotong)→ CHECKED_OUT →(selesai, final)→ COMPLETED ──

  // Helper: suntik pesanan (status bebas) langsung ke mock + sinkronkan state.
  async function seedOrder(
    invoice: string,
    status: "DRAFT" | "CHECKED_OUT",
    qty: number,
    uuidSuffix: string,
  ) {
    const oid = "55555555-5555-4555-8555-" + uuidSuffix;
    const iid = "66666666-6666-4666-8666-" + uuidSuffix;
    sb.tables["orders"].push({ id: oid, invoice_no: invoice, order_date: "2026-08-27", customer_id: null, customer_name: "T", subtotal: qty * 50000, discount: 0, total: qty * 50000, status, notes: null, created_by: null, created_at: "2026-08-27", updated_at: "2026-08-27" });
    sb.tables["order_items"].push({ id: iid, order_id: oid, product_id: ID.p1, product_name: "Algebra X", product_barcode: "BC1", quantity: qty, unit_price: 50000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: qty * 50000, created_at: "2026-08-27" });
    await actAsync(() => S().refresh());
  }

  it("checkoutOrder: DRAFT → CHECKED_OUT + movement SALE (stok terpotong saat proses)", async () => {
    await seedOrder("INV-101", "DRAFT", 1, "a1a1a1a1a1a1");
    const ok = await actAsync(() => S().checkoutOrder("INV-101"));
    expect(ok).toBe(true);
    expect(S().orders.find((x) => x.id === "INV-101")!.status).toBe("CHECKED_OUT");
    const sales = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].reference === "INV-101",
    );
    expect(sales).toHaveLength(1);
    expect((sales[0].args as Row[])[0].type).toBe("SALE");
    expect((sales[0].args as Row[])[0].quantity).toBe(-1);
  });

  it("checkoutOrder: stok kurang → false, tetap DRAFT, tanpa movement", async () => {
    await seedOrder("INV-102", "DRAFT", 99, "b2b2b2b2b2b2");
    const ok = await actAsync(() => S().checkoutOrder("INV-102"));
    expect(ok).toBe(false);
    expect(S().orders.find((x) => x.id === "INV-102")!.status).toBe("DRAFT");
    const movs = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].reference === "INV-102",
    );
    expect(movs).toHaveLength(0);
  });

  it("cancelOrder pada CHECKED_OUT (stok sudah terpotong): RETURN + CANCELLED", async () => {
    await seedOrder("INV-103", "DRAFT", 1, "c3c3c3c3c3c3");
    await actAsync(() => S().checkoutOrder("INV-103")); // → CHECKED_OUT + SALE
    const ok = await actAsync(() => S().cancelOrder("INV-103"));
    expect(ok).toBe(true);
    expect(S().orders.find((x) => x.id === "INV-103")!.status).toBe("CANCELLED");
    const rets = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].reference === "INV-103" && (c.args as Row[])[0].type === "RETURN",
    );
    expect(rets).toHaveLength(1);
    expect((rets[0].args as Row[])[0].quantity).toBe(1);
  });

  it("cancelOrder pada COMPLETED ditolak: final, tanpa movement, status utuh", async () => {
    await actAsync(() => S().completeOrder("INV-001")); // → COMPLETED
    const ok = await actAsync(() => S().cancelOrder("INV-001"));
    expect(ok).toBe(false);
    expect(S().orders.find((x) => x.id === "INV-001")!.status).toBe("COMPLETED");
    const rets = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].type === "RETURN",
    );
    expect(rets).toHaveLength(0);
  });

  it("addOrder CHECKED_OUT: stok terpotong saat order dibuat", async () => {
    const res = await actAsync(() =>
      S().addOrder({
        date: "2026-08-27", customerId: null, customerName: "T",
        items: [{ id: "n1", productId: ID.p1, productName: "Algebra X", productBarcode: "BC1", quantity: 2, unitPrice: 50000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 100000 }],
        subtotal: 100000, discount: 0, total: 100000, status: "CHECKED_OUT",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe("CHECKED_OUT");
    const sales = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].type === "SALE",
    );
    expect(sales).toHaveLength(1);
    expect((sales[0].args as Row[])[0].quantity).toBe(-2);
  });

  it("addOrder CHECKED_OUT stok kurang → order dikembalikan jadi DRAFT", async () => {
    const res = await actAsync(() =>
      S().addOrder({
        date: "2026-08-27", customerId: null, customerName: "T",
        items: [{ id: "n2", productId: ID.p1, productName: "Algebra X", productBarcode: "BC1", quantity: 99, unitPrice: 50000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 4950000 }],
        subtotal: 4950000, discount: 0, total: 4950000, status: "CHECKED_OUT",
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe("DRAFT");
    const sales = sb.calls.filter(
      (c) => c.op === "insert" && c.table === "stock_movements" && (c.args as Row[])[0].type === "SALE",
    );
    expect(sales).toHaveLength(0);
  });

  it("archiveOrder: arsipkan tanpa mengubah status (data utuh)", async () => {
    await actAsync(() => S().archiveOrder("INV-001", true));
    const o = S().orders.find((x) => x.id === "INV-001")!;
    expect(o.archived).toBe(true);
    expect(o.status).toBe("CHECKED_OUT"); // status tidak berubah
  });

  it("adjustStock: movement ADJUSTMENT", async () => {
    await actAsync(() => S().adjustStock(ID.p1, -3, "koreksi"));
    const mov = sb.calls.find((c) => c.op === "insert" && c.table === "stock_movements");
    expect(mov).toBeDefined();
    expect((mov!.args as Row[])[0].type).toBe("ADJUSTMENT");
    expect((mov!.args as Row[])[0].quantity).toBe(-3);
  });
});

describe("Guard skema DB (validasi mock setara Postgres)", () => {
  // Test ini membuktikan mock menolak nilai yang akan ditolak DB sungguhan —
  // jadi kalau store mulai mengirim nilai tak valid, test di atas ikut jatuh.
  it("menolak enum tak valid (products.semester)", async () => {
    const { error } = await sb
      .from("products")
      .insert({ name: "X", category_id: ID.c1, barcode: "B", description: "", published_year: 2025, semester: "XXX", stock: 0 })
      .select()
      .single();
    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("22P02");
  });

  it("menolak uuid kosong (category_id: \"\")", async () => {
    const { error } = await sb
      .from("products")
      .insert({ name: "X", category_id: "", barcode: "B", description: "", published_year: 2025, semester: "Ganjil", stock: 0 })
      .select()
      .single();
    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("22P02");
  });

  it("menolak format date salah (order_date: \"27/08/2026\")", async () => {
    const { error } = await sb
      .from("orders")
      .insert({ invoice_no: "INV-999", order_date: "27/08/2026", customer_id: null, customer_name: "X", subtotal: 0, discount: 0, total: 0, status: "DRAFT" })
      .select()
      .single();
    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("22P02");
  });

  it("menerima order_date format YYYY-MM-DD", async () => {
    const { error } = await sb
      .from("orders")
      .insert({ invoice_no: "INV-998", order_date: "2026-08-27", customer_id: null, customer_name: "X", subtotal: 0, discount: 0, total: 0, status: "DRAFT" })
      .select()
      .single();
    expect(error).toBeNull();
  });

  it("menolak order_items.quantity = 0 (CHECK quantity > 0)", async () => {
    const { error } = await sb
      .from("order_items")
      .insert({ order_id: ID.o1, product_id: ID.p1, product_name: "X", product_barcode: "B", quantity: 0, unit_price: 1000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: 0 })
      .select()
      .single();
    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("23514");
  });

  it("menolak stock_movements.quantity = 0 (CHECK quantity <> 0)", async () => {
    const { error } = await sb
      .from("stock_movements")
      .insert({ product_id: ID.p1, type: "ADJUSTMENT", quantity: 0, reference: "x" })
      .select()
      .single();
    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("23514");
  });
});
