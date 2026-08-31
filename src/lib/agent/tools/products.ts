// ─────────────────────────────────────────────────────────────────────────────
// Product tools (whitelist). All writes go through the user's Supabase
// session, so RLS policies keep applying server-side.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentTool,
  ToolContext,
  ToolFailure,
  ToolResult,
} from "../types";
import {
  type BulkDeleteZeroStockParams,
  type CreateProductParams,
  type DeleteProductParams,
  type UpdateProductParams,
  validateBulkDeleteZeroStock,
  validateCreateProduct,
  validateDeleteProduct,
  validateGetProduct,
  validateSearchProducts,
  validateUpdateProduct,
} from "../schemas/tools";
import {
  type CategoryRow,
  type ProductPriceRow,
  type ProductRow,
  fetchCategoryByName,
  fetchProductFull,
} from "./shared";

export interface ProductView {
  id: string;
  name: string;
  category?: string;
  barcode: string;
  description: string;
  publishedYear: number;
  semester: string;
  stock: number;
  defaultPrice: number | null;
  prices: { tierName: string; price: number; isDefault: boolean }[];
}

function toView(p: ProductRow, prices: ProductPriceRow[], category?: CategoryRow): ProductView {
  const defaultPrice =
    prices.find((x) => x.is_default)?.price ??
    prices.find((x) => x.tier_name === "Normal")?.price ??
    prices[0]?.price ??
    null;
  return {
    id: p.id,
    name: p.name,
    category: category?.name,
    barcode: p.barcode,
    description: p.description,
    publishedYear: p.published_year ?? 0,
    semester: p.semester,
    stock: p.stock,
    defaultPrice,
    prices: prices.map((x) => ({ tierName: x.tier_name, price: x.price, isDefault: x.is_default })),
  };
}

function dbError(source: string): ToolFailure {
  return { ok: false, code: "DB_ERROR", message: `Terjadi masalah saat mengakses database (${source}).` };
}

// ─── get_product ─────────────────────────────────────────────────────────────

export const get_product: AgentTool = {
  name: "get_product",
  description: "Ambil detail satu produk berdasarkan id.",
  risk: "read",
};

export async function runGetProduct(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<ProductView>> {
  const v = validateGetProduct(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  try {
    const full = await fetchProductFull(ctx.supabase, v.value.id);
    if (!full) return { ok: false, code: "NOT_FOUND", message: "Produk tidak ditemukan." };
    return { ok: true, data: toView(full.product, full.prices, full.category) };
  } catch (e) {
    console.error(formatAgentError(e, "get_product"));
    return dbError("get_product");
  }
}

// ─── search_products ─────────────────────────────────────────────────────────

export const search_products: AgentTool = {
  name: "search_products",
  description: "Cari produk berdasarkan nama/barcode.",
  risk: "read",
};

export interface SearchResult {
  id: string;
  name: string;
  category?: string;
  barcode: string;
  stock: number;
  defaultPrice: number | null;
}

export async function runSearchProducts(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<{ results: SearchResult[]; query: string }>> {
  const v = validateSearchProducts(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value;
  try {
    const isBarcodeLike = /^\d{12,14}$/.test(p.query);
    const { data, error } = await ctx.supabase
      .from("products")
      .select("id, name, category_id, barcode, stock")
      .or(isBarcodeLike ? `barcode.eq.${p.query}` : `name.ilike.%${p.query}%,barcode.ilike.%${p.query}%`)
      .order("name", { ascending: true })
      .limit(p.limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as (ProductRow & { category_id: string | null })[];
    const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean) as string[])];
    let categories: CategoryRow[] = [];
    if (catIds.length) {
      const { data: catRows, error: catError } = await ctx.supabase
        .from("categories")
        .select("id, name")
        .in("id", catIds);
      if (catError) throw new Error(catError.message);
      categories = (catRows ?? []) as CategoryRow[];
    }
    const priceByProduct = new Map<string, number | null>();
    if (rows.length) {
      const { data: priceRows, error: priceError } = await ctx.supabase
        .from("product_prices")
        .select("product_id, tier_name, price, is_default")
        .in(
          "product_id",
          rows.map((r) => r.id),
        );
      if (priceError) throw new Error(priceError.message);
      for (const pr of (priceRows ?? []) as ProductPriceRow[]) {
        const existing = priceByProduct.get(pr.product_id);
        if (existing == null) {
          priceByProduct.set(pr.product_id, pr.price);
        } else if (pr.is_default || pr.tier_name === "Normal") {
          priceByProduct.set(pr.product_id, pr.price);
        }
      }
    }
    const catById = new Map(categories.map((c) => [c.id, c.name]));
    return {
      ok: true,
      data: {
        query: p.query,
        results: rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category_id ? catById.get(r.category_id) : undefined,
          barcode: r.barcode,
          stock: r.stock,
          defaultPrice: priceByProduct.get(r.id) ?? null,
        })),
      },
    };
  } catch (e) {
    console.error(formatAgentError(e, "search_products"));
    return dbError("search_products");
  }
}

// ─── create_product ──────────────────────────────────────────────────────────

export const create_product: AgentTool = {
  name: "create_product",
  description: "Buat produk baru (termasuk harga tier Normal dan stok awal).",
  risk: "safe_write",
};

export interface CreateProductResult {
  product: ProductView;
  categoryCreated: boolean;
}

export async function runCreateProduct(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<CreateProductResult>> {
  const v = validateCreateProduct(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value as CreateProductParams;
  try {
    // Resolve the category by id; fall back to name lookup, creating the
    // category when it doesn't exist yet (disclosed via `categoryCreated`).
    let categoryId: string | null = p.categoryId ?? null;
    let categoryCreated = false;
    if (!categoryId && p.category) {
      const existing = await fetchCategoryByName(ctx.supabase, p.category);
      if (existing) {
        categoryId = existing.id;
      } else {
        const { data: created, error: createError } = await ctx.supabase
          .from("categories")
          .insert({ name: p.category, description: "" })
          .select("id, name")
          .single();
        if (createError) {
          console.error(formatAgentError(createError, "create_product.category"));
          return dbError("create_product.category");
        }
        categoryId = (created as CategoryRow).id;
        categoryCreated = true;
      }
    }
    if (!categoryId) {
      return { ok: false, code: "VALIDATION", message: "Kategori produk belum dapat ditentukan." };
    }

    const { data: product, error: productError } = await ctx.supabase
      .from("products")
      .insert({
        name: p.name,
        category_id: categoryId,
        barcode: p.barcode,
        description: p.description,
        published_year: p.publishedYear,
        semester: p.semester,
        stock: 0,
      })
      .select("id, name, category_id, barcode, description, published_year, semester, stock, created_at, updated_at")
      .single();
    if (productError) {
      if (productError.code === "23505") {
        return { ok: false, code: "CONFLICT", message: "Produk dengan barcode tersebut sudah ada." };
      }
      console.error(formatAgentError(productError, "create_product"));
      return dbError("create_product");
    }

    const { error: priceError } = await ctx.supabase
      .from("product_prices")
      .insert({
        product_id: product.id,
        tier_name: "Normal",
        price: p.sellingPrice,
        is_default: true,
      })
      .select("id, product_id, tier_name, price, is_default, created_at");
    if (priceError) {
      // Roll the product back so a failed create never leaves half-state.
      await ctx.supabase.from("products").delete().eq("id", product.id);
      console.error(formatAgentError(priceError, "create_product.prices"));
      return dbError("create_product.prices");
    }

    if (p.stock > 0) {
      const { error: moveError } = await ctx.supabase.from("stock_movements").insert({
        product_id: product.id,
        type: "INITIAL",
        quantity: p.stock,
        reference: `Stok awal — dibuat lewat agent oleh ${ctx.user.id}`,
        created_by: ctx.user.id,
      });
      if (moveError) {
        await ctx.supabase.from("product_prices").delete().eq("product_id", product.id);
        await ctx.supabase.from("products").delete().eq("id", product.id);
        console.error(formatAgentError(moveError, "create_product.movement"));
        return dbError("create_product.movement");
      }
    }

    const full = (await fetchProductFull(ctx.supabase, product.id))!;
    return {
      ok: true,
      data: { product: toView(full.product, full.prices, full.category), categoryCreated },
    };
  } catch (e) {
    console.error(formatAgentError(e, "create_product"));
    return dbError("create_product");
  }
}

// ─── update_product ──────────────────────────────────────────────────────────

export const update_product: AgentTool = {
  name: "update_product",
  description: "Perbarui info produk atau harga tier default (satu record).",
  risk: "safe_write",
};

export interface UpdateProductResult {
  product: ProductView;
  changed: string[];
}

export async function runUpdateProduct(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<UpdateProductResult>> {
  const v = validateUpdateProduct(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value as UpdateProductParams;
  try {
    const before = await fetchProductFull(ctx.supabase, p.id);
    if (!before) return { ok: false, code: "NOT_FOUND", message: "Produk tidak ditemukan." };

    const patch: Record<string, unknown> = {};
    const changed: string[] = [];
    if (p.name != null && p.name !== before.product.name) {
      patch.name = p.name;
      changed.push("nama");
    }
    if (p.description != null && p.description !== before.product.description) {
      patch.description = p.description;
      changed.push("deskripsi");
    }
    if (p.publishedYear != null && p.publishedYear !== before.product.published_year) {
      patch.published_year = p.publishedYear;
      changed.push("tahun terbit");
    }
    if (p.semester != null && p.semester !== before.product.semester) {
      patch.semester = p.semester;
      changed.push("semester");
    }
    if (p.categoryId != null && p.categoryId !== before.product.category_id) {
      const cat = (await ctx.supabase.from("categories").select("id").eq("id", p.categoryId).maybeSingle()).data;
      if (!cat) return { ok: false, code: "NOT_FOUND", message: "Kategori tujuan tidak ditemukan." };
      patch.category_id = p.categoryId;
      changed.push("kategori");
    }

    let priceChanged = false;
    if (p.price != null) {
      const defaultRow =
        before.prices.find((x) => x.is_default) ??
        before.prices.find((x) => x.tier_name === "Normal");
      if (defaultRow) {
        const { error: priceErr } = await ctx.supabase
          .from("product_prices")
          .update({ price: p.price })
          .eq("id", defaultRow.id);
        if (priceErr) throw new Error(priceErr.message);
        priceChanged = p.price !== defaultRow.price;
      } else {
        const { error: insertErr } = await ctx.supabase.from("product_prices").insert({
          product_id: p.id,
          tier_name: "Normal",
          price: p.price,
          is_default: true,
        });
        if (insertErr) throw new Error(insertErr.message);
        priceChanged = true;
      }
      if (priceChanged) changed.push("harga");
    }

    if (Object.keys(patch).length > 0) {
      const { error: patchError } = await ctx.supabase
        .from("products")
        .update(patch)
        .eq("id", p.id);
      if (patchError) {
        console.error(formatAgentError(patchError, "update_product"));
        return dbError("update_product");
      }
    }
    if (changed.length === 0) {
      return {
        ok: true,
        data: { product: toView(before.product, before.prices, before.category), changed: [] },
      };
    }
    const full = (await fetchProductFull(ctx.supabase, p.id))!;
    return { ok: true, data: { product: toView(full.product, full.prices, full.category), changed } };
  } catch (e) {
    console.error(formatAgentError(e, "update_product"));
    return dbError("update_product");
  }
}

// ─── delete_product (SENSITIVE — approval required) ─────────────────────────

export const delete_product: AgentTool = {
  name: "delete_product",
  description: "Hapus satu produk. Membutuhkan approval.",
  risk: "sensitive_write",
};

export interface DeleteProductResult {
  deleted: { id: string; name: string };
}

export async function runDeleteProduct(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<DeleteProductResult>> {
  const v = validateDeleteProduct(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value as DeleteProductParams;
  try {
    const { data, error } = await ctx.supabase
      .from("products")
      .delete()
      .eq("id", p.id)
      .select("id, name");
    if (error) {
      console.error(formatAgentError(error, "delete_product"));
      return dbError("delete_product");
    }
    if (!data || data.length === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Produk tidak ditemukan (mungkin sudah dihapus)." };
    }
    return { ok: true, data: { deleted: { id: (data[0] as ProductRow).id, name: (data[0] as ProductRow).name } } };
  } catch (e) {
    console.error(formatAgentError(e, "delete_product"));
    return dbError("delete_product");
  }
}

// ─── bulk_delete_zero_stock (DANGEROUS — approval + admin) ──────────────────

export const bulk_delete_zero_stock: AgentTool = {
  name: "bulk_delete_zero_stock",
  description: "Hapus banyak produk yang stoknya 0. Membutuhkan approval + admin.",
  risk: "dangerous",
  requiresAdmin: true,
};

export interface BulkDeleteResult {
  deleted: { id: string; name: string }[];
  skipped: number;
}

/** Find products currently at stock 0 (read-only preview for the approval card). */
export async function previewZeroStock(
  ctx: ToolContext,
): Promise<{ ok: true; items: { id: string; name: string }[] } | ToolFailure> {
  try {
    const { data, error } = await ctx.supabase
      .from("products")
      .select("id, name")
      .eq("stock", 0)
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return { ok: true, items: ((data ?? []) as ProductRow[]).map((p) => ({ id: p.id, name: p.name })) };
  } catch (e) {
    console.error(formatAgentError(e, "preview_zero_stock"));
    return dbError("preview_zero_stock");
  }
}

export async function runBulkDeleteZeroStock(
  params: unknown,
  ctx: ToolContext,
): Promise<ToolResult<BulkDeleteResult>> {
  const v = validateBulkDeleteZeroStock(params);
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  const p = v.value as BulkDeleteZeroStockParams;
  if (ctx.user.role !== "admin") {
    return { ok: false, code: "FORBIDDEN", message: "Operasi massal hanya dapat dilakukan oleh admin." };
  }
  try {
    const { data, error } = await ctx.supabase
      .from("products")
      .delete()
      .in("id", p.productIds)
      .eq("stock", 0) // safety: only delete what still has zero stock
      .select("id, name");
    if (error) {
      console.error(formatAgentError(error, "bulk_delete_zero_stock"));
      return dbError("bulk_delete_zero_stock");
    }
    const deleted = ((data ?? []) as ProductRow[]).map((x) => ({ id: x.id, name: x.name }));
    return { ok: true, data: { deleted, skipped: p.productIds.length - deleted.length } };
  } catch (e) {
    console.error(formatAgentError(e, "bulk_delete_zero_stock"));
    return dbError("bulk_delete_zero_stock");
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatAgentError(err: unknown, source: string): string {
  const e = err as { message?: string; code?: string; details?: string };
  return `[${source}] ${e?.message ?? String(err)}${e?.code ? ` (code=${e.code})` : ""}${e?.details ? ` details=${e.details}` : ""}`;
}
