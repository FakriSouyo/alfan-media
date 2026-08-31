// ─────────────────────────────────────────────────────────────────────────────
// Stock tools.
//   - reads: list stock / low stock
//   - safe write: single-record adjustment (ADJUSTMENT movement; the DB
//     trigger keeps products.stock in sync)
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTool, ToolContext, ToolResult } from "../types";
import {
  type UpdateStockParams,
  validateGetLowStock,
  validateUpdateStock,
} from "../schemas/tools";
import { type ProductRow, fetchProductFull } from "./shared";

export const get_stock: AgentTool = {
  name: "get_stock",
  description: "Daftar produk dengan sisa stok.",
  risk: "read",
};

export const get_low_stock_products: AgentTool = {
  name: "get_low_stock_products",
  description: "Produk yang stoknya di bawah ambang.",
  risk: "read",
};

export const update_stock: AgentTool = {
  name: "update_stock",
  description: "Sesuaikan stok satu produk (movement ADJUSTMENT).",
  risk: "safe_write",
};

export interface StockItem {
  id: string;
  name: string;
  category?: string;
  stock: number;
  defaultPrice: number | null;
}

export interface LowStockResult {
  threshold: number;
  items: StockItem[];
}

async function loadStockItems(
  ctx: ToolContext,
  rows: ProductRow[],
): Promise<StockItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean) as string[])];
  const [{ data: catRows }, { data: priceRows }] = await Promise.all([
    catIds.length
      ? ctx.supabase.from("categories").select("id, name").in("id", catIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ctx.supabase.from("product_prices").select("product_id, tier_name, price, is_default").in("product_id", ids),
  ]);
  const catById = new Map((catRows ?? []).map((c) => [c.id, c.name]));
  const priceByProduct = new Map<string, number>();
  for (const p of (priceRows ?? []) as { product_id: string; tier_name: string; price: number; is_default: boolean }[]) {
    const existing = priceByProduct.get(p.product_id);
    if (existing === undefined || p.is_default || p.tier_name === "Normal") {
      priceByProduct.set(p.product_id, p.price);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category_id ? catById.get(r.category_id) : undefined,
    stock: r.stock,
    defaultPrice: priceByProduct.get(r.id) ?? null,
  }));
}

export async function runGetStock(
  ctx: ToolContext,
  limit = 100,
): Promise<ToolResult<StockItem[]>> {
  try {
    const { data, error } = await ctx.supabase
      .from("products")
      .select("id, name, category_id, barcode, stock")
      .order("stock", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) throw new Error(error.message);
    const items = await loadStockItems(ctx, (data ?? []) as ProductRow[]);
    return { ok: true, data: items };
  } catch (e) {
    console.error(`[get_stock] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca data stok." };
  }
}

export async function runGetLowStock(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<LowStockResult>> {
  const v = validateGetLowStock(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const { threshold, limit } = v.value;
  try {
    const { data, error } = await ctx.supabase
      .from("products")
      .select("id, name, category_id, barcode, stock")
      .lte("stock", threshold)
      .order("stock", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const items = await loadStockItems(ctx, (data ?? []) as ProductRow[]);
    return { ok: true, data: { threshold, items } };
  } catch (e) {
    console.error(`[get_low_stock] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca data stok." };
  }
}

export interface UpdateStockResult {
  id: string;
  name: string;
  before: number;
  after: number;
  movement: number; // signed
  /** Terisi bila saldo ledger masih negatif setelah penyesuaian. */
  note?: string;
}

export async function runUpdateStock(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<UpdateStockResult>> {
  const v = validateUpdateStock(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value as UpdateStockParams;
  try {
    const full = await fetchProductFull(ctx.supabase, p.id);
    if (!full) return { ok: false, code: "NOT_FOUND", message: "Produk tidak ditemukan." };
    const before = full.product.stock;
    // SALDO LEDGER (tanpa clamp): products.stock = greatest(0, SUM(movements))
    // (trigger 004_triggers.sql). Saldo harus diketahui agar:
    //   (a) setTo berfungsi sebagai "jadikan stok = X" sungguhan — termasuk
    //       menutup defisit tersembunyi — bukan sekadar delta dari tampilan;
    //   (b) pengguna diberi tahu bila saldo masih negatif setelah penyesuaian
    //       (tanpa info ini "0 → 0 (+5)" terlihat seperti operasi gagal).
    const { data: movRows, error: movErr } = await ctx.supabase
      .from("stock_movements")
      .select("quantity")
      .eq("product_id", p.id);
    if (movErr) throw new Error(movErr.message);
    let net = (movRows ?? []).reduce(
      (s, r) => s + (Number((r as { quantity: number }).quantity) || 0),
      0,
    );
    if ((movRows ?? []).length === 0 && before > 0) {
      net = before; // produk legacy tanpa riwayat ledger: anggap saldo = tampil
    }
    const movement = p.setTo != null ? p.setTo - net : (p.delta as number);
    if (movement === 0) {
      return { ok: false, code: "VALIDATION", message: "Tidak ada perubahan stok (nilai sama dengan saldo saat ini)." };
    }
    // Hanya PENGURANGAN yang diblokir membuat saldo negatif. Penambahan
    // yang (sementara) belum menutup defisit tetap dicatat — itulah cara
    // defisit ditutup — dan dilaporkan lewat `note` di bawah.
    if (movement < 0 && net + movement < 0) {
      return {
        ok: false,
        code: "CONFLICT",
        message: `Stok tidak cukup: saldo tercatat ${net}, pengurangan ${Math.abs(movement)} akan membuat saldo negatif.`,
      };
    }
    const { error: moveError } = await ctx.supabase.from("stock_movements").insert({
      product_id: p.id,
      type: "ADJUSTMENT",
      quantity: movement,
      reference: p.reference,
      created_by: ctx.user.id,
    });
    if (moveError) {
      console.error(`[update_stock] ${moveError.message} ${moveError.details ?? ""}`);
      return { ok: false, code: "DB_ERROR", message: "Gagal mencatat penyesuaian stok." };
    }
    const afterFull = (await fetchProductFull(ctx.supabase, p.id))!;
    const after = afterFull.product.stock;
    // Saldo setelah penyesuaian yang masih negatif = defisit yang belum
    // tertutup (stok tampil 0 hingga ditutup).
    const deficit = Math.max(0, -(net + movement));
    return {
      ok: true,
      data: {
        id: p.id,
        name: full.product.name,
        before,
        after,
        movement,
        ...(deficit > 0
          ? {
              note: `Penyesuaian tercatat, tapi saldo produk ini masih −${deficit} karena penjualan sebelumnya melebihi stok tercatat; stok akan mulai naik setelah selisih itu tertutup.`,
            }
          : {}),
      },
    };
  } catch (e) {
    console.error(`[update_stock] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Gagal menyesuaikan stok." };
  }
}
