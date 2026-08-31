/* Uji tools agent terhadap MockSupabase (DB fake, skema divalidasi). */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MockSupabase, type Row } from "@/lib/__tests__/mocks/mock-supabase";
import type { AgentUser, ToolContext } from "@/lib/agent/types";
import {
  previewZeroStock,
  runBulkDeleteZeroStock,
  runCreateProduct,
  runDeleteProduct,
  runGetProduct,
  runSearchProducts,
  runUpdateProduct,
} from "@/lib/agent/tools/products";
import { runGetLowStock, runGetStock, runUpdateStock } from "@/lib/agent/tools/stock";
import { runGetSales, runGetSalesSummary, runGetTopSelling, runGetTodaySales } from "@/lib/agent/tools/sales";
import { resolveProduct } from "@/lib/agent/tools/shared";

const ADMIN: AgentUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" };
const STAFF: AgentUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "staff" };

const ID = {
  c1: "11111111-1111-4111-8111-111111111111",
  c2: "11111111-1111-4111-8111-111111111112",
  p1: "22222222-2222-4222-8222-222222222222",
  p2: "22222222-2222-4222-8222-222222222223",
  p3: "22222222-2222-4222-8222-222222222224",
  pp1: "33333333-3333-4333-8333-333333333333",
  o1: "55555555-5555-4555-8555-555555555555",
  o2: "55555555-5555-4555-8555-555555555556",
  oi1: "66666666-6666-4666-8666-666666666666",
} as const;

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function seedDb(): Record<string, Row[]> {
  const now = new Date();
  const today = iso(now);
  // Tanggal di pertengahan bulan sebelumnya (pasti ≠ bulan ini).
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const prevDay = iso(prevMonth);
  return {
    categories: [
      { id: ID.c1, name: "Matematika", level: "SMA", description: "", created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: ID.c2, name: "Bahasa Inggris", level: "SMP", description: "", created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    products: [
      { id: ID.p1, name: "Algebra X", category_id: ID.c1, barcode: "8990000000011", description: "", published_year: 2025, semester: "Ganjil", stock: 10, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: ID.p2, name: "Algebra XI", category_id: ID.c1, barcode: "8990000000028", description: "", published_year: 2025, semester: "Ganjil", stock: 2, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: ID.p3, name: "English Practice", category_id: ID.c2, barcode: "8990000000035", description: "", published_year: 2026, semester: "Genap", stock: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    product_prices: [
      { id: ID.pp1, product_id: ID.p1, tier_name: "Normal", price: 50000, is_default: true, created_at: "2026-01-01" },
    ],
    orders: [
      { id: ID.o1, invoice_no: "INV-001", order_date: today, customer_id: null, customer_name: "SMA 1", subtotal: 150000, discount: 0, total: 150000, status: "COMPLETED", notes: null, created_by: null, created_at: today, updated_at: today },
      { id: ID.o2, invoice_no: "INV-002", order_date: prevDay, customer_id: null, customer_name: "SMA 2", subtotal: 60000, discount: 0, total: 60000, status: "COMPLETED", notes: null, created_by: null, created_at: prevDay, updated_at: prevDay },
    ],
    order_items: [
      { id: ID.oi1, order_id: ID.o1, product_id: ID.p1, product_name: "Algebra X", product_barcode: "8990000000011", quantity: 3, unit_price: 50000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: 150000, created_at: today },
    ],
    // Ledger konsisten dengan products.stock (trigger = max(0, SUM)):
    // p1: 10, p2: 2, p3: 0 (tanpa riwayat).
    stock_movements: [
      { id: "sm-p1", product_id: ID.p1, type: "INITIAL", quantity: 10, reference: "seed", created_by: null, created_at: "2026-01-01" },
      { id: "sm-p2", product_id: ID.p2, type: "INITIAL", quantity: 2, reference: "seed", created_by: null, created_at: "2026-01-01" },
    ],
  };
}

function makeCtx(user: AgentUser = ADMIN): { ctx: ToolContext; mock: MockSupabase } {
  const mock = new MockSupabase(seedDb());
  mock.simulateDbBehavior = true;
  return { ctx: { supabase: mock as unknown as SupabaseClient, user }, mock };
}

describe("tools: products", () => {
  it("runGetProduct: menemukan produk + harga + kategori", async () => {
    const { ctx } = makeCtx();
    const res = await runGetProduct({ id: ID.p1 }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.name).toBe("Algebra X");
    expect(res.data.defaultPrice).toBe(50000);
    expect(res.data.category).toBe("Matematika");
    expect(res.data.stock).toBe(10);
  });

  it("runGetProduct: id tak dikenal → NOT_FOUND", async () => {
    const { ctx } = makeCtx();
    const res = await runGetProduct({ id: "99999999-9999-4999-8999-999999999999" }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
  });

  it("runSearchProducts: nama & barcode", async () => {
    const { ctx } = makeCtx();
    const byName = await runSearchProducts({ query: "algebra", limit: 10 }, ctx);
    expect(byName.ok).toBe(true);
    if (byName.ok) expect(byName.data.results.length).toBe(2);
    const byBarcode = await runSearchProducts({ query: "8990000000035", limit: 10 }, ctx);
    expect(byBarcode.ok).toBe(true);
    if (byBarcode.ok) {
      expect(byBarcode.data.results.length).toBe(1);
      expect(byBarcode.data.results[0].name).toBe("English Practice");
    }
  });

  it("runCreateProduct: produk + harga Normal + movement INITIAL (trigger)", async () => {
    const { ctx, mock } = makeCtx();
    const res = await runCreateProduct(
      {
        name: "Fisika Dasar",
        category: "Matematika",
        barcode: "8991111111111",
        sellingPrice: 65000,
        description: "Buku fisika SMA",
        publishedYear: 2026,
        semester: "Ganjil",
        stock: 15,
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.categoryCreated).toBe(false);
    expect(res.data.product.name).toBe("Fisika Dasar");
    expect(res.data.product.stock).toBe(15); // trigger mock: 0 + 15
    const priceRow = mock.tables["product_prices"].find((p) => p.product_id === res.data.product.id);
    expect(priceRow).toBeTruthy();
    expect(priceRow?.price).toBe(65000);
    expect(priceRow?.is_default).toBe(true);
    const move = mock.tables["stock_movements"].find((m) => m.product_id === res.data.product.id);
    expect(move).toBeTruthy();
    expect(move?.type).toBe("INITIAL");
    expect(move?.quantity).toBe(15);
  });

  it("runCreateProduct: kategori baru dibuat (disclosed)", async () => {
    const { ctx, mock } = makeCtx();
    const res = await runCreateProduct(
      {
        name: "Sejarah Nusantara",
        category: "IPS/Sosial",
        barcode: "8992222222222",
        sellingPrice: 40000,
        description: "",
        publishedYear: 2026,
        semester: "Genap",
        stock: 0,
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.categoryCreated).toBe(true);
    const cat = mock.tables["categories"].find((c) => c.name === "IPS/Sosial");
    expect(cat).toBeTruthy();
  });

  it("runCreateProduct: barcode invalid → VALIDATION (tidak menyentuh DB)", async () => {
    const { ctx, mock } = makeCtx();
    const before = mock.tables["products"].length;
    const res = await runCreateProduct(
      { name: "X", category: "Matematika", barcode: "123", sellingPrice: 1000, description: "", publishedYear: 2026, semester: "Ganjil", stock: 1 },
      ctx,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("VALIDATION");
    expect(mock.tables["products"].length).toBe(before);
  });

  it("runUpdateProduct: harga tier default", async () => {
    const { ctx, mock } = makeCtx();
    const res = await runUpdateProduct({ id: ID.p1, price: 55000 }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.changed).toContain("harga");
    expect(mock.tables["product_prices"][0].price).toBe(55000);
  });

  it("runUpdateProduct: tanpa perubahan apa pun → changed kosong", async () => {
    const { ctx } = makeCtx();
    const res = await runUpdateProduct({ id: ID.p1, price: 50000 }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.changed).toEqual([]);
  });

  it("runDeleteProduct: menghapus produk (cascade harga)", async () => {
    const { ctx, mock } = makeCtx();
    const res = await runDeleteProduct({ id: ID.p3 }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.deleted.name).toBe("English Practice");
    expect(mock.tables["products"].find((p) => p.id === ID.p3)).toBeUndefined();
  });

  it("runDeleteProduct: id salah → VALIDATION", async () => {
    const { ctx } = makeCtx();
    const res = await runDeleteProduct({ id: "bukan-uuid" }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("VALIDATION");
  });

  it("bulk_delete_zero_stock: staff ditolak (FORBIDDEN)", async () => {
    const { ctx, mock } = makeCtx(STAFF);
    const preview = await previewZeroStock(ctx);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const res = await runBulkDeleteZeroStock({ productIds: preview.items.map((i) => i.id) }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FORBIDDEN");
    expect(mock.tables["products"].length).toBe(3);
  });

  it("bulk_delete_zero_stock: admin menghapus hanya produk stok 0", async () => {
    const { ctx } = makeCtx(ADMIN);
    // p3 stok 0; p1 stok 10 (dipaksa ikut dalam daftar → harus dilewati).
    const res = await runBulkDeleteZeroStock({ productIds: [ID.p1, ID.p3] }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.deleted).toHaveLength(1);
    expect(res.data.deleted[0].id).toBe(ID.p3);
    expect(res.data.skipped).toBe(1);
  });
});

describe("tools: stock", () => {
  it("runGetLowStock: ambang 5 → p2 (2) & p3 (0)", async () => {
    const { ctx } = makeCtx();
    const res = await runGetLowStock({ threshold: 5, limit: 50 }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = res.data.items.map((i) => i.name).sort();
    expect(names).toEqual(["Algebra XI", "English Practice"]);
  });

  it("runGetStock: terurut stok terendah", async () => {
    const { ctx } = makeCtx();
    const res = await runGetStock(ctx, 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].name).toBe("English Practice");
    expect(res.data[0].stock).toBe(0);
  });

  it("runUpdateStock: delta menambah (trigger memperbarui stok)", async () => {
    const { ctx, mock } = makeCtx();
    const res = await runUpdateStock(
      { id: ID.p1, delta: 5, reference: "Penyesuaian stok via AI agent" },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.before).toBe(10);
    expect(res.data.after).toBe(15);
    expect(res.data.movement).toBe(5);
    const row = mock.tables["products"].find((p) => p.id === ID.p1);
    expect(row?.stock).toBe(15);
  });

  it("runUpdateStock: setTo absolut", async () => {
    const { ctx } = makeCtx();
    const res = await runUpdateStock(
      { id: ID.p1, setTo: 40, reference: "Penyesuaian via agent" },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.after).toBe(40);
      expect(res.data.movement).toBe(30);
    }
  });

  it("runUpdateStock: stok tak cukup → CONFLICT (tanpa movement)", async () => {
    const { ctx, mock } = makeCtx();
    const before = mock.tables["stock_movements"].length;
    const res = await runUpdateStock(
      { id: ID.p1, delta: -999, reference: "kesalahan" },
      ctx,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONFLICT");
    expect(mock.tables["stock_movements"].length).toBe(before);
  });

  it("runUpdateStock: delta 0 → VALIDATION", async () => {
    const { ctx } = makeCtx();
    const res = await runUpdateStock({ id: ID.p1, delta: 0, reference: "x" }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("VALIDATION");
  });

  it("runUpdateStock: saldo defisit → delta tercatat, stok tetap 0, diberi note", async () => {
    const { ctx, mock } = makeCtx();
    // Ledger p3: INITIAL +10, SALE −14 → saldo −4, tampil 0 (over-sell).
    mock.tables["stock_movements"].push(
      { id: "sm-def-1", product_id: ID.p3, type: "INITIAL", quantity: 10, reference: "awal", created_by: null, created_at: "2026-01-01" },
      { id: "sm-def-2", product_id: ID.p3, type: "SALE", quantity: -14, reference: "over-sell", created_by: null, created_at: "2026-01-02" },
    );
    const res = await runUpdateStock({ id: ID.p3, delta: 2, reference: "top up" }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.before).toBe(0);
    expect(res.data.after).toBe(0); // −4 + 2 = −2 → tampil 0
    expect(res.data.movement).toBe(2);
    expect(res.data.note).toContain("−2");
    expect(mock.tables["products"].find((p) => p.id === ID.p3)?.stock).toBe(0);
  });

  it("runUpdateStock: setTo menutup defisit → stok benar-benar jadi X", async () => {
    const { ctx, mock } = makeCtx();
    mock.tables["stock_movements"].push(
      { id: "sm-def-3", product_id: ID.p3, type: "INITIAL", quantity: 10, reference: "awal", created_by: null, created_at: "2026-01-01" },
      { id: "sm-def-4", product_id: ID.p3, type: "SALE", quantity: -14, reference: "over-sell", created_by: null, created_at: "2026-01-02" },
    );
    const res = await runUpdateStock({ id: ID.p3, setTo: 5, reference: "koreksi" }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.movement).toBe(9); // 5 − (−4)
    expect(res.data.after).toBe(5);
    expect(res.data.note).toBeUndefined();
    expect(mock.tables["products"].find((p) => p.id === ID.p3)?.stock).toBe(5);
  });
});

describe("tools: sales (hanya COMPLETED)", () => {
  it("runGetTodaySales: hanya transaksi hari ini", async () => {
    const { ctx } = makeCtx();
    const res = await runGetTodaySales(ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.transactions).toBe(1);
    expect(res.data.total).toBe(150000);
    expect(res.data.itemsSold).toBe(3);
    expect(res.data.topProducts[0].name).toBe("Algebra X");
  });

  it("runGetSales: this_month = order hari ini; last_month = order bulan lalu", async () => {
    const { ctx } = makeCtx();
    const cur = await runGetSales({ kind: "this_month" }, ctx);
    expect(cur.ok).toBe(true);
    if (cur.ok) {
      expect(cur.data.transactions).toBe(1);
      expect(cur.data.total).toBe(150000);
    }
    const prev = await runGetSales({ kind: "last_month" }, ctx);
    expect(prev.ok).toBe(true);
    if (prev.ok) {
      expect(prev.data.transactions).toBe(1);
      expect(prev.data.total).toBe(60000);
    }
  });

  it("runGetSalesSummary: delta vs periode sebelumnya", async () => {
    const { ctx } = makeCtx();
    const res = await runGetSalesSummary({ kind: "this_month" }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.previousTransactions).toBe(1);
    expect(res.data.previousTotal).toBe(60000);
    expect(res.data.deltaPercent).toBe(Math.round(((150000 - 60000) / 60000) * 1000) / 10);
  });

  it("runGetTopSelling: agregat per nama produk", async () => {
    const { ctx } = makeCtx();
    const res = await runGetTopSelling({ kind: "this_month" }, ctx, 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items[0].name).toBe("Algebra X");
    expect(res.data.items[0].quantity).toBe(3);
    expect(res.data.items[0].revenue).toBe(150000);
  });
});

describe("resolveProduct", () => {
  it("nama persis → found", async () => {
    const { ctx } = makeCtx();
    const res = await resolveProduct(ctx, { name: "Algebra X" });
    expect(res.kind).toBe("found");
  });

  it("nama mirip (substring unik) → found", async () => {
    const { ctx } = makeCtx();
    const res = await resolveProduct(ctx, { name: "algebra xi" });
    expect(res.kind).toBe("found");
  });

  it("nama ambigu (2 kandidat) → ambiguous", async () => {
    const { ctx } = makeCtx();
    const res = await resolveProduct(ctx, { name: "algebra" });
    // "algebra" persis tak ada; fuzzy "%algebra%" → 2 kandidat
    expect(res.kind).toBe("ambiguous");
    if (res.kind === "ambiguous") expect(res.candidates).toHaveLength(2);
  });

  it("barcode → found", async () => {
    const { ctx } = makeCtx();
    const res = await resolveProduct(ctx, { barcode: "8990000000011" });
    expect(res.kind).toBe("found");
  });

  it("tak ditemukan → not_found", async () => {
    const { ctx } = makeCtx();
    const res = await resolveProduct(ctx, { name: "Buku Fantasi XYZ" });
    expect(res.kind).toBe("not_found");
  });
});
