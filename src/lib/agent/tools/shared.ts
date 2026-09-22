// ─────────────────────────────────────────────────────────────────────────────
// Shared tool helpers: row shapes, lookups, period ranges.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCandidate, ToolContext } from "../types";
import type { PeriodSpec } from "../schemas/tools";

// ─── Row shapes (snake_case, straight from Supabase) ─────────────────────────

export interface ProductRow {
  id: string;
  name: string;
  category_id: string | null;
  barcode: string;
  description: string;
  published_year: number | null;
  semester: "Ganjil" | "Genap";
  stock: number;
  cost_price: number;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductPriceRow {
  id: string;
  product_id: string;
  tier_name: string;
  price: number;
  is_default: boolean;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  level: "SD" | "SMP" | "SMA" | null;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  invoice_no: string;
  order_date: string;
  customer_id: string | null;
  customer_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: "DRAFT" | "CHECKED_OUT" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_barcode: string;
  quantity: number;
  unit_price: number;
  price_tier: string;
  custom_price: number | null;
  discount_percent: number;
  subtotal: number;
  created_at: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

// ─── Period ranges (inclusive, local calendar dates) ─────────────────────────

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function periodRange(period: PeriodSpec, now: Date = new Date()): DateRange {
  switch (period.kind) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: iso(d), to: iso(d) };
    }
    case "this_week": {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: iso(start), to: iso(end) };
    }
    case "last_week": {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7;
      const end = new Date(d);
      end.setDate(d.getDate() - day - 1);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return { from: iso(start), to: iso(end) };
    }
    case "this_month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
    case "this_year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case "last_year":
      return {
        from: iso(new Date(now.getFullYear() - 1, 0, 1)),
        to: iso(new Date(now.getFullYear() - 1, 11, 31)),
      };
  }
}

/** The period immediately before `period` (for comparisons). */
export function previousPeriod(period: PeriodSpec): PeriodSpec {
  switch (period.kind) {
    case "today":
      return { kind: "yesterday" };
    case "this_week":
      return { kind: "last_week" };
    case "this_month":
      return { kind: "last_month" };
    case "this_year":
      return { kind: "last_year" };
    default:
      return period;
  }
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

/**
 * Cari kategori (rak) per nama — opsional per kelas (`level`).
 * Rak LKS = mapel + kelas, jadi mapel yang sama bisa punya beberapa
 * kategori (Matematika [SMP I], Matematika [SMA I], ...).
 * Tanpa level: 1 cocok → dipakai; 0 → null; >1 (beberapa kelas) → null,
 * dipanggilan memutuskan (bikin generik / tanyakan kelasnya).
 */
export async function fetchCategoryByName(
  supabase: SupabaseClient,
  name: string,
  level?: string,
): Promise<CategoryRow | null> {
  const q = supabase
    .from("categories")
    .select("id, name, level, description, created_at, updated_at")
    .ilike("name", name);
  if (level) {
    const { data, error } = await q.eq("level", level).maybeSingle();
    if (error) throw new Error("category lookup failed");
    return (data as CategoryRow | null) ?? null;
  }
  const { data, error } = await q;
  if (error) throw new Error("category lookup failed");
  const rows = (data ?? []) as CategoryRow[];
  return rows.length === 1 ? rows[0] : null;
}

export async function fetchCategories(
  supabase: SupabaseClient,
): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error("category list failed");
  return (data ?? []) as CategoryOption[];
}

export async function fetchProductFull(
  supabase: SupabaseClient,
  id: string,
): Promise<{ product: ProductRow; prices: ProductPriceRow[]; category?: CategoryRow } | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category_id, barcode, description, published_year, semester, stock, cost_price, image_path, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("product lookup failed");
  if (!data) return null;
  const product = data as ProductRow;
  const { data: priceRows, error: priceError } = await supabase
    .from("product_prices")
    .select("id, product_id, tier_name, price, is_default, created_at")
    .eq("product_id", id);
  if (priceError) throw new Error("price lookup failed");
  let category: CategoryRow | undefined;
  if (product.category_id) {
    const { data: cat, error: catError } = await supabase
      .from("categories")
      .select("id, name, level, description, created_at, updated_at")
      .eq("id", product.category_id)
      .maybeSingle();
    if (catError) throw new Error("category lookup failed");
    category = (cat as CategoryRow | null) ?? undefined;
  }
  return { product, prices: (priceRows ?? []) as ProductPriceRow[], category };
}

export type ProductRef =
  | { kind: "found"; product: ProductRow; category?: CategoryRow }
  | { kind: "not_found" }
  | { kind: "ambiguous"; candidates: AgentCandidate[] };

/**
 * Resolve a product from id, name, or barcode.
 * Name matching prefers exact (case-insensitive), then unique substring.
 */
export async function resolveProduct(
  ctx: ToolContext,
  ref: { id?: string; name?: string; barcode?: string },
): Promise<ProductRef> {
  const { supabase } = ctx;
  if (ref.id) {
    const { product } = (await fetchProductFull(supabase, ref.id)) ?? {};
    if (!product) return { kind: "not_found" };
    const category = product.category_id
      ? ((await supabase.from("categories").select("*").eq("id", product.category_id).maybeSingle()).data as CategoryRow | null) ?? undefined
      : undefined;
    return { kind: "found", product, category };
  }
  if (ref.barcode) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", ref.barcode)
      .maybeSingle();
    if (error) throw new Error("barcode lookup failed");
    if (!data) return { kind: "not_found" };
    return { kind: "found", product: data as ProductRow };
  }
  if (ref.name) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .ilike("name", ref.name)
      .order("name", { ascending: true })
      .limit(1);
    if (error) throw new Error("product lookup failed");
    if (data && data.length === 1) {
      return { kind: "found", product: data[0] as ProductRow };
    }
    const { data: fuzzy, error: fuzzyError } = await supabase
      .from("products")
      .select("*")
      .ilike("name", `%${ref.name}%`)
      .order("name", { ascending: true })
      .limit(5);
    if (fuzzyError) throw new Error("product lookup failed");
    if (!fuzzy || fuzzy.length === 0) return { kind: "not_found" };
    if (fuzzy.length === 1) return { kind: "found", product: fuzzy[0] as ProductRow };
    return {
      kind: "ambiguous",
      candidates: (fuzzy as ProductRow[]).map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: p.barcode,
      })),
    };
  }
  return { kind: "not_found" };
}

/** Human label for a product row. */
export function productLabel(p: ProductRow, category?: CategoryRow): string {
  return category ? `${p.name} (${category.name})` : p.name;
}
