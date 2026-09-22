// ─────────────────────────────────────────────────────────────────────────────
// Per-tool parameter types + validation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type ValidateResult,
  isBarcode,
  isInt,
  isNonEmptyString,
  isPrice,
  isSemester,
  isStringMax,
  isUuid,
  isYear,
} from "./validate";

// ─── products ────────────────────────────────────────────────────────────────

export interface GetProductParams {
  id: string;
}

export function validateGetProduct(p: unknown): ValidateResult<GetProductParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!isUuid(o.id)) return { ok: false, errors: [{ field: "id", message: "id produk tidak valid" }] };
  return { ok: true, value: { id: o.id } };
}

export interface SearchProductsParams {
  query: string;
  limit: number;
}

export function validateSearchProducts(p: unknown): ValidateResult<SearchProductsParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.query, 80)) {
    return { ok: false, errors: [{ field: "query", message: "query pencarian wajib diisi" }] };
  }
  const limit = isInt(o.limit, 1, 50) ? o.limit : 12;
  return { ok: true, value: { query: o.query.trim(), limit } };
}

/**
 * Rak kelas: jenjang polos (rak lama, mis. "SMA") atau jenjang+kelas romawi
 * (SD I–VI, SMP I–III dengan I=VII, SMA I–III dengan I=X).
 */
export const CATEGORY_LEVEL_RE = /^(SD|SMP|SMA)( I| II| III| IV| V| VI)?$/;

export interface CreateProductParams {
  name: string;
  /** Resolved category id, preferred. */
  categoryId?: string;
  /** Category name (mapel) — resolved (or created) by the tool. */
  category?: string;
  /** Kelas/rak (mis. "SMA I" = kelas X). Dipakai memilih/membuat rak. */
  level?: string;
  barcode: string;
  sellingPrice: number;
  /** Harga awal / modal per unit (opsional; default 0). */
  costPrice?: number;
  description: string;
  publishedYear: number;
  semester: "Ganjil" | "Genap";
  stock: number;
}

export function validateCreateProduct(p: unknown): ValidateResult<CreateProductParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!isNonEmptyString(o.name, 120)) errors.push({ field: "name", message: "nama produk wajib diisi" });
  const hasCategoryId = isUuid(o.categoryId);
  const hasCategoryName = isNonEmptyString(o.category, 80);
  if (!hasCategoryId && !hasCategoryName) {
    errors.push({ field: "category", message: "kategori wajib diisi (id atau nama)" });
  }
  const level = isNonEmptyString(o.level, 12) ? String(o.level).trim() : undefined;
  if (o.level != null && !CATEGORY_LEVEL_RE.test(level ?? "")) {
    errors.push({ field: "level", message: 'level harus jenjang "SD/SMP/SMA" opsional + kelas romawi (mis. "SMA I")' });
  }
  if (!isBarcode(o.barcode)) errors.push({ field: "barcode", message: "barcode harus 12–14 digit angka" });
  if (!isPrice(o.sellingPrice)) errors.push({ field: "sellingPrice", message: "harga jual tidak valid" });
  if (o.costPrice != null && !isPrice(o.costPrice))
    errors.push({ field: "costPrice", message: "harga awal tidak valid" });
  if (o.description != null && !isStringMax(o.description, 2000))
    errors.push({ field: "description", message: "deskripsi terlalu panjang" });
  if (!isYear(o.publishedYear)) errors.push({ field: "publishedYear", message: "tahun terbit tidak valid" });
  if (!isSemester(o.semester)) errors.push({ field: "semester", message: "semester harus Ganjil atau Genap" });
  if (!isInt(o.stock, 0, 1_000_000)) errors.push({ field: "stock", message: "stok tidak valid" });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: String(o.name).trim(),
      categoryId: hasCategoryId ? (o.categoryId as string) : undefined,
      category: hasCategoryName ? String(o.category).trim() : undefined,
      level,
      barcode: String(o.barcode).trim(),
      sellingPrice: o.sellingPrice as number,
      costPrice: o.costPrice != null ? (o.costPrice as number) : undefined,
      description: isNonEmptyString(o.description, 2000) ? String(o.description).trim() : "",
      publishedYear: o.publishedYear as number,
      semester: o.semester as "Ganjil" | "Genap",
      stock: o.stock as number,
    },
  };
}

export interface UpdateProductParams {
  id: string;
  name?: string;
  description?: string;
  publishedYear?: number;
  semester?: "Ganjil" | "Genap";
  categoryId?: string;
  /** New price for the default (Normal) tier. */
  price?: number;
  /** New harga awal / modal per unit. */
  costPrice?: number;
}

export function validateUpdateProduct(p: unknown): ValidateResult<UpdateProductParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!isUuid(o.id)) errors.push({ field: "id", message: "id produk tidak valid" });
  if (o.name != null && !isNonEmptyString(o.name, 120))
    errors.push({ field: "name", message: "nama produk tidak valid" });
  if (o.description != null && !isNonEmptyString(o.description, 2000))
    errors.push({ field: "description", message: "deskripsi terlalu panjang" });
  if (o.publishedYear != null && !isYear(o.publishedYear))
    errors.push({ field: "publishedYear", message: "tahun terbit tidak valid" });
  if (o.semester != null && !isSemester(o.semester))
    errors.push({ field: "semester", message: "semester tidak valid" });
  if (o.categoryId != null && !isUuid(o.categoryId))
    errors.push({ field: "categoryId", message: "kategori tidak valid" });
  if (o.price != null && !isPrice(o.price))
    errors.push({ field: "price", message: "harga tidak valid" });
  if (o.costPrice != null && !isPrice(o.costPrice))
    errors.push({ field: "costPrice", message: "harga awal tidak valid" });
  if (errors.length) return { ok: false, errors };
  const value: UpdateProductParams = { id: o.id as string };
  if (o.name != null) value.name = String(o.name).trim();
  if (o.description != null) value.description = String(o.description).trim();
  if (o.publishedYear != null) value.publishedYear = o.publishedYear as number;
  if (o.semester != null) value.semester = o.semester as "Ganjil" | "Genap";
  if (o.categoryId != null) value.categoryId = o.categoryId as string;
  if (o.price != null) value.price = o.price as number;
  if (o.costPrice != null) value.costPrice = o.costPrice as number;
  return { ok: true, value };
}

export interface DeleteProductParams {
  id: string;
}

export function validateDeleteProduct(p: unknown): ValidateResult<DeleteProductParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!isUuid(o.id)) return { ok: false, errors: [{ field: "id", message: "id produk tidak valid" }] };
  return { ok: true, value: { id: o.id } };
}

export interface BulkDeleteZeroStockParams {
  productIds: string[];
}

export function validateBulkDeleteZeroStock(p: unknown): ValidateResult<BulkDeleteZeroStockParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.productIds) || o.productIds.length === 0 || o.productIds.length > 500) {
    return { ok: false, errors: [{ field: "productIds", message: "daftar produk tidak valid" }] };
  }
  if (!o.productIds.every((id) => isUuid(id))) {
    return { ok: false, errors: [{ field: "productIds", message: "id produk tidak valid" }] };
  }
  return { ok: true, value: { productIds: o.productIds } };
}

// ─── stock ───────────────────────────────────────────────────────────────────

export interface GetLowStockParams {
  threshold: number;
  limit: number;
}

export function validateGetLowStock(p: unknown): ValidateResult<GetLowStockParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  const threshold = isInt(o.threshold, 0, 1000) ? o.threshold : 5;
  const limit = isInt(o.limit, 1, 200) ? o.limit : 50;
  return { ok: true, value: { threshold, limit } };
}

export interface UpdateStockParams {
  id: string;
  /** Positive = masuk, negative = keluar. Ignored when `setTo` is present. */
  delta?: number;
  /** Absolute target stock. */
  setTo?: number;
  reference: string;
}

export function validateUpdateStock(p: unknown): ValidateResult<UpdateStockParams> {
  const o = (p ?? {}) as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!isUuid(o.id)) errors.push({ field: "id", message: "id produk tidak valid" });
  const hasDelta = o.delta != null && isInt(o.delta, -1_000_000, 1_000_000) && o.delta !== 0;
  const hasSetTo = o.setTo != null && isInt(o.setTo, 0, 1_000_000);
  if (!hasDelta && !hasSetTo) {
    errors.push({ field: "delta", message: "perubahan stok tidak valid (gunakan delta atau setTo)" });
  }
  if (hasDelta && hasSetTo) {
    errors.push({ field: "delta", message: "hanya satu dari delta/setTo yang boleh diberikan" });
  }
  if (!isNonEmptyString(o.reference, 200)) {
    errors.push({ field: "reference", message: "referensi penyesuaian wajib diisi" });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: o.id as string,
      delta: hasDelta ? (o.delta as number) : undefined,
      setTo: hasSetTo ? (o.setTo as number) : undefined,
      reference: String(o.reference).trim(),
    },
  };
}

// ─── sales / reports ─────────────────────────────────────────────────────────

export type PeriodSpec =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "this_week" }
  | { kind: "last_week" }
  | { kind: "this_month" }
  | { kind: "last_month" }
  | { kind: "this_year" }
  | { kind: "last_year" };

export type { ValidateResult };
