"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  Category,
  Product,
  Customer,
  Order,
  StockMovement,
  SuratJalan,
} from "./types";
import { getSupabaseBrowserClient } from "./supabase/browser";
import { formatError } from "./error-log";
import { useAuth } from "./auth-context";

// ─── Shape DB row (snake_case) → TS type (camelCase) ───────────────────────
type CategoryRow = {
  id: string;
  name: string;
  level: string | null;
  description: string;
  created_at: string;
  updated_at: string;
};
type ProductRow = {
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
};
type ProductPriceRow = {
  id: string;
  product_id: string;
  tier_name: string;
  price: number;
  is_default: boolean;
};
type CustomerRow = {
  id: string;
  name: string;
  price_tier: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};
type OrderRow = {
  id: string;
  invoice_no: string;
  order_date: string;
  customer_id: string | null;
  customer_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: "DRAFT" | "CHECKED_OUT" | "COMPLETED" | "CANCELLED";
  archived?: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type OrderItemRow = {
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
  cost_price: number;
  created_at: string;
};
type StockMovementRow = {
  id: string;
  product_id: string;
  type: "INITIAL" | "SALE" | "ADJUSTMENT" | "RETURN" | "CANCELLED_ORDER";
  quantity: number;
  reference: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type SuratJalanRow = {
  id: string;
  order_id: string;
  no: string;
  tanggal: string;
  pengirim: string;
  penerima: string;
  estimasi: string;
  nama_pengirim: string;
  kendaraan: string;
  catatan: string;
};

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  level: r.level ?? undefined,
  description: r.description,
  createdAt: r.created_at,
});
const toProduct = (r: ProductRow, prices: ProductPriceRow[]): Product => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id ?? "",
  barcode: r.barcode,
  description: r.description,
  publishedYear: r.published_year ?? new Date().getFullYear(),
  semester: r.semester,
  stock: r.stock,
  prices: prices.map((p) => ({
    id: p.id,
    tierName: p.tier_name,
    price: p.price,
    isDefault: p.is_default,
  })),
  costPrice: r.cost_price ?? 0,
  imagePath: r.image_path ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  priceTier: r.price_tier,
  phone: r.phone ?? undefined,
  address: r.address ?? undefined,
});
const toOrder = (r: OrderRow, items: OrderItemRow[], sj?: SuratJalan): Order => ({
  id: r.invoice_no, // penting: pakai invoice_no sebagai id utama (INV-001)
  date: r.order_date,
  customerId: r.customer_id,
  customerName: r.customer_name,
  items: items.map((i) => ({
    id: i.id,
    productId: i.product_id ?? "",
    productName: i.product_name,
    productBarcode: i.product_barcode,
    quantity: i.quantity,
    unitPrice: i.unit_price,
    priceTier: i.price_tier,
    customPrice: i.custom_price,
    discountPercent: Number(i.discount_percent),
    subtotal: i.subtotal,
    costPrice: i.cost_price ?? 0,
  })),
  subtotal: r.subtotal,
  discount: r.discount,
  total: r.total,
  status: r.status,
  archived: r.archived ?? false,
  // Surat jalan tersimpan per order — harus di-load di refresh() agar hasil
  // edit tampil lagi setelah navigasi/refresh.
  suratJalan: sj,
  revisions: [], // revisi belum di-load (belum ada UI untuk ini)
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toSuratJalan = (r: SuratJalanRow): SuratJalan => ({
  no: r.no,
  tanggal: r.tanggal,
  pengirim: r.pengirim,
  penerima: r.penerima,
  estimasi: r.estimasi,
  namaPengirim: r.nama_pengirim,
  kendaraan: r.kendaraan,
  catatan: r.catatan,
});
const toMovement = (r: StockMovementRow): StockMovement => ({
  id: r.id,
  productId: r.product_id,
  type: r.type,
  quantity: r.quantity,
  reference: r.reference,
  createdAt: r.created_at,
});

// ─── Context ──────────────────────────────────────────────────────────────
interface StoreValue {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
  movements: StockMovement[];
  loading: boolean;
  error: string | null;

  // Categories
  addCategory: (name: string, description: string, level?: string) => Promise<Category | null>;
  updateCategory: (id: string, name: string, description: string, level?: string) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<void>;

  // Products
  addProduct: (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product | null>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<void>;

  // Customers
  addCustomer: (c: Omit<Customer, "id">) => Promise<Customer | null>;

  // Orders
  addOrder: (o: Omit<Order, "id" | "createdAt" | "updatedAt" | "revisions">) => Promise<Order | null>;
  updateOrder: (id: string, patch: Partial<Order>) => Promise<void>;
  updateSuratJalan: (id: string, data: Partial<SuratJalan>) => Promise<void>;
  /**
   * DRAFT → CHECKED_OUT ("masuk proses") — STOK TERPOTONG DI SINI.
   * false = stok tidak cukup (anti-oversell), pesanan tetap DRAFT.
   */
  checkoutOrder: (id: string) => Promise<boolean>;
  /**
   * CHECKED_OUT → COMPLETED (final). Stok sudah terpotong saat proses.
   * false = stok tidak cukup (hanya pesanan legacy yang belum terpotong).
   */
  completeOrder: (id: string) => Promise<boolean>;
  /**
   * Batalkan: DRAFT (tanpa efek) / CHECKED_OUT (stok dikembalikan).
   * COMPLETED bersifat FINAL → false. false juga bila pesanan tak ditemukan.
   */
  cancelOrder: (id: string) => Promise<boolean>;
  /** Arsipkan/pulihkan: sembunyikan dari daftar, data (stok & laporan) utuh. */
  archiveOrder: (id: string, archived: boolean) => Promise<void>;
  /** Hapus pesanan permanen beserta data terkait (items, surat jalan, movements). */
  deleteOrder: (id: string) => Promise<boolean>;
  getNextInvoiceId: () => Promise<string>;

  // Stock
  adjustStock: (productId: string, qty: number, reference: string) => Promise<boolean>;

  // Manual refresh (opsional)
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const { user, loading: authLoading } = useAuth();
  const authUserId = user?.id ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(authUserId);
  const refreshVersionRef = useRef(0);

  const clearProtectedData = useCallback(() => {
    setCategories([]);
    setProducts([]);
    setCustomers([]);
    setOrders([]);
    setMovements([]);
    setDataUserId(null);
  }, []);

  // Supabase applies a server row cap (commonly 1,000). Page every table so
  // financial and stock history is never silently truncated.
  const refresh = useCallback(async () => {
    const userId = authUserId;
    if (currentUserIdRef.current !== userId) return;
    const requestVersion = ++refreshVersionRef.current;
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!userId) {
      clearProtectedData();
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const PAGE_SIZE = 1000;
    const fetchAll = async (table: "categories" | "products" | "product_prices" | "customers" | "orders" | "order_items" | "stock_movements" | "surat_jalans", orderColumn?: string, ascending = true) => {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = supabase.from(table).select("*");
        if (orderColumn) query = query.order(orderColumn, { ascending });
        if (orderColumn !== "id") query = query.order("id", { ascending: true });
        const { data, error: queryError } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (queryError) throw queryError;
        const page = (data ?? []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    };

    try {
      const [catRows, productRows, priceRows, customerRows, orderRows, itemRows, movementRows, suratJalanRows] = await Promise.all([
        fetchAll("categories", "name"),
        fetchAll("products", "name"),
        fetchAll("product_prices", "id"),
        fetchAll("customers", "name"),
        fetchAll("orders", "order_date", false),
        fetchAll("order_items", "id"),
        fetchAll("stock_movements", "created_at", false),
        fetchAll("surat_jalans", "id"),
      ]);
      if (requestVersion !== refreshVersionRef.current || currentUserIdRef.current !== userId) return;

      const priceRowsTyped = priceRows as unknown as ProductPriceRow[];
      const itemsByOrder = new Map<string, OrderItemRow[]>();
      for (const item of itemRows as unknown as OrderItemRow[]) {
        const bucket = itemsByOrder.get(item.order_id) ?? [];
        bucket.push(item);
        itemsByOrder.set(item.order_id, bucket);
      }
      const suratJalanByOrder = new Map((suratJalanRows as unknown as SuratJalanRow[]).map((sj) => [sj.order_id, sj]));
      const pricesByProduct = new Map<string, ProductPriceRow[]>();
      for (const price of priceRowsTyped) {
        const bucket = pricesByProduct.get(price.product_id) ?? [];
        bucket.push(price);
        pricesByProduct.set(price.product_id, bucket);
      }

      setCategories((catRows as unknown as CategoryRow[]).map(toCategory));
      setProducts((productRows as unknown as ProductRow[]).map((product) => toProduct(product, pricesByProduct.get(product.id) ?? [])));
      setCustomers((customerRows as unknown as CustomerRow[]).map(toCustomer));
      setOrders((orderRows as unknown as OrderRow[]).map((order) => {
        const sj = suratJalanByOrder.get(order.id);
        return toOrder(order, itemsByOrder.get(order.id) ?? [], sj ? toSuratJalan(sj) : undefined);
      }));
      setMovements((movementRows as unknown as StockMovementRow[]).map(toMovement));
      setDataUserId(userId);
      setError(null);
    } catch (loadError) {
      if (requestVersion !== refreshVersionRef.current || currentUserIdRef.current !== userId) return;
      console.error(formatError(loadError, "store refresh"));
      setError("Data toko gagal dimuat. Periksa koneksi dan coba lagi.");
    } finally {
      if (requestVersion === refreshVersionRef.current && currentUserIdRef.current === userId) setLoading(false);
    }
  }, [authLoading, authUserId, clearProtectedData, supabase]);

  useEffect(() => {
    currentUserIdRef.current = authUserId;
    queueMicrotask(() => { void refresh(); });
  }, [authUserId, refresh]);

  // ─── Categories ────────────────────────────────────────────────────────
  const addCategory = useCallback(
    async (name: string, description: string, level?: string) => {
      const row = {
        name,
        description,
        // `level` adalah label bebas ("SD I", "SMP II", "SD", dst.) — kolom text di DB.
        level: level || null,
      };
      const { data, error } = await supabase
        .from("categories")
        .insert(row)
        .select()
        .single();
      if (error) {
        console.error(formatError(error, "addCategory"));
        setError("Kategori gagal disimpan. Periksa apakah kombinasi nama dan kelas sudah ada.");
        return null;
      }
      const created = toCategory(data as CategoryRow);
      setCategories((prev) => [...prev, created]);
      return created;
    },
    [supabase]
  );

  const updateCategory = useCallback(
    async (id: string, name: string, description: string, level?: string) => {
      const { error } = await supabase
        .from("categories")
        .update({
          name,
          description,
          // `level` adalah label bebas ("SD I", "SMP II", "SD", dst.) — kolom text di DB.
          level: level || null,
        })
        .eq("id", id);
      if (error) {
        console.error(formatError(error, "updateCategory"));
        setError("Kategori gagal diperbarui. Periksa apakah kombinasi nama dan kelas sudah ada.");
        return false;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, description, level } : c))
      );
      return true;
    },
    [supabase]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) {
        console.error(formatError(error, "deleteCategory"));
        setError("Kategori gagal dihapus. Data sebelumnya tetap dipertahankan.");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
    },
    [supabase]
  );

  // ─── Products ──────────────────────────────────────────────────────────
  const addProduct = useCallback(
    async (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
      const { data: prodRow, error: prodErr } = await supabase.rpc("create_product_atomic", {
        p_product: {
          name: p.name,
          category_id: p.categoryId || "",
          barcode: p.barcode.trim(),
          description: p.description,
          published_year: p.publishedYear,
          semester: p.semester,
          cost_price: p.costPrice ?? 0,
          image_path: p.imagePath ?? "",
        },
        p_prices: p.prices.map((price) => ({ tier_name: price.tierName, price: price.price, is_default: price.isDefault })),
        p_initial_stock: p.stock,
      });
      if (prodErr || !prodRow) {
        console.error(formatError(prodErr, "addProduct"));
        setError("Produk gagal disimpan. Periksa barcode, harga, dan koneksi database.");
        return null;
      }

      const createdRow = prodRow as ProductRow;
      const created = toProduct(createdRow, p.prices.map((pr, i) => ({
        id: `temp-${i}`,
        product_id: createdRow.id,
        tier_name: pr.tierName,
        price: pr.price,
        is_default: pr.isDefault,
      })));
      setProducts((prev) => [...prev, created]);
      await refresh();
      return created;
    },
    [supabase, refresh]
  );

  const updateProduct = useCallback(
    async (id: string, p: Partial<Product>) => {
      const patch: Record<string, unknown> = {};
      if (p.name !== undefined) patch.name = p.name;
      if (p.categoryId !== undefined) patch.category_id = p.categoryId || null;
      if (p.barcode !== undefined) patch.barcode = p.barcode;
      if (p.description !== undefined) patch.description = p.description;
      if (p.publishedYear !== undefined) patch.published_year = p.publishedYear;
      if (p.semester !== undefined) patch.semester = p.semester;
      if (p.costPrice !== undefined) patch.cost_price = p.costPrice;
      if (p.imagePath !== undefined) patch.image_path = p.imagePath || null;
      // CATATAN: `stock` TIDAK boleh ditulis langsung — dikalkulasi ulang dari
      // stock_movements oleh trigger sync_product_stock (pasca-migrasi).
      // Ubah stok lewat adjustStock() (movement ADJUSTMENT).

      const { data, error } = await supabase.rpc("update_product_atomic", {
        p_id: id,
        p_patch: patch,
        p_prices: p.prices === undefined ? null : p.prices.map((price) => ({ tier_name: price.tierName, price: price.price, is_default: price.isDefault })),
      });
      if (error || data !== true) {
        console.error(formatError(error ?? new Error("Product not found"), "updateProduct"));
        setError("Perubahan produk gagal disimpan. Data sebelumnya tetap dipertahankan.");
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        console.error(formatError(error, "deleteProduct"));
        setError("Produk gagal dihapus. Data sebelumnya tetap dipertahankan.");
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    [supabase]
  );

  // ─── Customers ─────────────────────────────────────────────────────────
  const addCustomer = useCallback(
    async (c: Omit<Customer, "id">) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: c.name,
          price_tier: c.priceTier,
          phone: c.phone ?? null,
          address: c.address ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        console.error(formatError(error, "addCustomer"));
        setError("Pelanggan gagal disimpan. Periksa data dan koneksi database.");
        return null;
      }
      const created = toCustomer(data as CustomerRow);
      setCustomers((prev) => [...prev, created]);
      return created;
    },
    [supabase]
  );

  // ─── Orders ────────────────────────────────────────────────────────────
  const getNextInvoiceId = useCallback(async () => {
    const { data, error } = await supabase.rpc("next_invoice_no");
    if (error) {
      console.error(formatError(error, "next_invoice_no"));
      // Fallback: cari max manual
      const nums = orders
        .map((o) => parseInt(o.id.replace("INV-", ""), 10))
        .filter((n) => !isNaN(n));
      const max = nums.length > 0 ? Math.max(...nums) : 0;
      return "INV-" + String(max + 1).padStart(3, "0");
    }
    return data as string;
  }, [supabase, orders]);

  const addOrder = useCallback(
    async (o: Omit<Order, "id" | "createdAt" | "updatedAt" | "revisions">) => {
      const { data: orderRow, error: orderErr } = await supabase.rpc("create_order_atomic", {
        p_order: {
          order_date: o.date,
          customer_id: o.customerId || "",
          customer_name: o.customerName,
          subtotal: o.subtotal,
          discount: o.discount,
          total: o.total,
          status: o.status,
        },
        p_items: o.items.map((item) => ({
          product_id: item.productId || "",
          product_name: item.productName,
          product_barcode: item.productBarcode,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          price_tier: item.priceTier,
          custom_price: item.customPrice,
          discount_percent: item.discountPercent,
          subtotal: item.subtotal,
          cost_price: item.costPrice ?? products.find((product) => product.id === item.productId)?.costPrice ?? 0,
        })),
        p_surat_jalan: o.suratJalan ? {
          no: o.suratJalan.no,
          tanggal: o.suratJalan.tanggal,
          pengirim: o.suratJalan.pengirim,
          penerima: o.suratJalan.penerima,
          estimasi: o.suratJalan.estimasi,
          nama_pengirim: o.suratJalan.namaPengirim,
          kendaraan: o.suratJalan.kendaraan,
          catatan: o.suratJalan.catatan,
        } : null,
      });
      if (orderErr || !orderRow) {
        console.error(formatError(orderErr, "addOrder"));
        setError("Pesanan gagal disimpan sepenuhnya. Tidak ada perubahan stok atau pesanan yang diterapkan.");
        return null;
      }
      await refresh();
      return {
        ...o,
        status: (orderRow as OrderRow).status,
        id: (orderRow as OrderRow).invoice_no,
        revisions: [],
        createdAt: (orderRow as OrderRow).created_at,
        updatedAt: (orderRow as OrderRow).updated_at,
      };
    },
    [supabase, refresh, products]
  );

  const updateOrder = useCallback(
    async (id: string, patch: Partial<Order>) => {
      if (patch.status !== undefined) {
        setError("Perubahan status harus memakai tindakan proses, selesai, atau batalkan agar stok tetap konsisten.");
        return;
      }
      // Cari UUID internal order dari invoice_no
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) {
        console.error(formatError(findErr, "updateOrder find"));
        setError("Pesanan tidak ditemukan atau gagal dimuat untuk diperbarui.");
        return;
      }
      const updates: Record<string, unknown> = {};
      if (patch.status !== undefined) updates.status = patch.status;
      if (patch.subtotal !== undefined) updates.subtotal = patch.subtotal;
      if (patch.discount !== undefined) updates.discount = patch.discount;
      if (patch.total !== undefined) updates.total = patch.total;
      if (patch.customerName !== undefined) updates.customer_name = patch.customerName;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("orders").update(updates).eq("id", row.id);
        if (error) {
          console.error(formatError(error, "updateOrder"));
          setError("Perubahan pesanan gagal disimpan. Data sebelumnya tetap dipertahankan.");
          return;
        }
      }
      setOrders((prev) => prev.map((order) => order.id !== id ? order : {
        ...order,
        ...(patch.subtotal !== undefined ? { subtotal: patch.subtotal } : {}),
        ...(patch.discount !== undefined ? { discount: patch.discount } : {}),
        ...(patch.total !== undefined ? { total: patch.total } : {}),
        ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
      }));
    },
    [supabase]
  );

  const updateSuratJalan = useCallback(
    async (id: string, data: Partial<SuratJalan>) => {
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id, customer_name, order_date")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) {
        console.error(formatError(findErr, "updateSuratJalan find"));
        setError("Data pesanan gagal dimuat. Surat jalan belum diubah.");
        return;
      }

      // Cek apakah surat jalan sudah ada
      const { data: existing, error: existingError } = await supabase
        .from("surat_jalans")
        .select("*")
        .eq("order_id", row.id)
        .maybeSingle();
      if (existingError) {
        console.error(formatError(existingError, "updateSuratJalan lookup"));
        setError("Surat jalan gagal dimuat. Perubahan belum disimpan.");
        return;
      }

      const base: SuratJalan = existing
        ? {
            no: existing.no,
            tanggal: existing.tanggal,
            pengirim: existing.pengirim,
            penerima: existing.penerima,
            estimasi: existing.estimasi,
            namaPengirim: existing.nama_pengirim,
            kendaraan: existing.kendaraan,
            catatan: existing.catatan,
          }
        : {
            no: "SJ-" + id,
            tanggal: row.order_date,
            pengirim: "",
            penerima: row.customer_name,
            estimasi: "",
            namaPengirim: "",
            kendaraan: "",
            catatan: "",
          };

      const merged: SuratJalan = { ...base, ...data };

      if (existing) {
        const { error } = await supabase
          .from("surat_jalans")
          .update({
            no: merged.no,
            tanggal: merged.tanggal,
            pengirim: merged.pengirim,
            penerima: merged.penerima,
            estimasi: merged.estimasi,
            nama_pengirim: merged.namaPengirim,
            kendaraan: merged.kendaraan,
            catatan: merged.catatan,
          })
          .eq("order_id", row.id);
        if (error) {
          console.error(formatError(error, "updateSuratJalan update"));
          setError("Surat jalan gagal diperbarui. Data sebelumnya tetap dipertahankan.");
          return;
        }
      } else {
        const { error } = await supabase.from("surat_jalans").insert({
          order_id: row.id,
          no: merged.no,
          tanggal: merged.tanggal,
          pengirim: merged.pengirim,
          penerima: merged.penerima,
          estimasi: merged.estimasi,
          nama_pengirim: merged.namaPengirim,
          kendaraan: merged.kendaraan,
          catatan: merged.catatan,
        });
        if (error) {
          console.error(formatError(error, "updateSuratJalan insert"));
          setError("Surat jalan gagal disimpan. Data sebelumnya tetap dipertahankan.");
          return;
        }
      }
      setOrders((prev) => prev.map((order) => order.id === id ? { ...order, suratJalan: merged } : order));
    },
    [supabase]
  );

  // ─── Status transitions ────────────────────────────────────────────────
  // DRAFT →(checkoutOrder)→ CHECKED_OUT →(completeOrder)→ COMPLETED (final).
  // Stok terpotong saat MASUK PROSES (→ CHECKED_OUT), bukan saat selesai.
  const checkoutOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("transition_order_atomic", { p_invoice_no: id, p_target: "CHECKED_OUT" });
      if (error) {
        console.error(formatError(error, "checkoutOrder"));
        setError("Pesanan tidak dapat diproses. Periksa stok dan coba lagi.");
        return false;
      }
      if (data !== true) return false;
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  const completeOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("transition_order_atomic", { p_invoice_no: id, p_target: "COMPLETED" });
      if (error) {
        console.error(formatError(error, "completeOrder"));
        setError("Pesanan gagal ditandai selesai. Periksa status dan stok lalu coba lagi.");
        return false;
      }
      if (data !== true) return false;
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  const cancelOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("transition_order_atomic", { p_invoice_no: id, p_target: "CANCELLED" });
      if (error) {
        console.error(formatError(error, "cancelOrder"));
        setError("Pesanan gagal dibatalkan. Stok dan status tetap dipertahankan.");
        return false;
      }
      if (data !== true) return false;
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  // Arsip: sembunyikan dari daftar tanpa menghapus — ledger stok & total
  // penjualan tidak terpengaruh (status pesanan tetap apa adanya).
  const archiveOrder = useCallback(
    async (id: string, archived: boolean) => {
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) {
        console.error(formatError(findErr, "archiveOrder find"));
        setError("Pesanan gagal dimuat untuk pengarsipan.");
        return;
      }
      const { error } = await supabase.from("orders").update({ archived }).eq("id", row.id);
      if (error) {
        console.error(formatError(error, "archiveOrder"));
        setError("Status arsip pesanan gagal diperbarui.");
        return;
      }
      setOrders((prev) => prev.map((order) => order.id === id ? { ...order, archived } : order));
    },
    [supabase]
  );

  // Hapus permanen: orders ON DELETE CASCADE akan menghapus order_items,
  // surat_jalans, order_revisions, dll. Stock movements yang merujuk invoice
  // (reference = invoice_no) ikut dibersihkan manual agar stok kembali sinkron.
  const deleteOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("delete_order_atomic", { p_invoice_no: id });
      if (error) {
        console.error(formatError(error, "deleteOrder"));
        setError("Pesanan gagal dihapus. Data sebelumnya tetap dipertahankan.");
        return false;
      }
      if (data !== true) return false;
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  // ─── Stock ─────────────────────────────────────────────────────────────
  const adjustStock = useCallback(
    async (productId: string, qty: number, reference: string) => {
      if (!Number.isInteger(qty) || qty === 0 || !reference.trim()) {
        setError("Penyesuaian stok memerlukan jumlah bulat selain nol dan catatan.");
        return false;
      }
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        type: "ADJUSTMENT",
        quantity: qty,
        reference,
      });
      if (error) {
        console.error(formatError(error, "adjustStock"));
        setError("Penyesuaian stok gagal disimpan. Stok sebelumnya tetap dipertahankan.");
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  const hasCurrentUserData = Boolean(authUserId && authUserId === dataUserId);
  const value = useMemo<StoreValue>(() => ({
        categories: hasCurrentUserData ? categories : [],
        products: hasCurrentUserData ? products : [],
        customers: hasCurrentUserData ? customers : [],
        orders: hasCurrentUserData ? orders : [],
        movements: hasCurrentUserData ? movements : [],
        loading,
        error,
        addCategory,
        updateCategory,
        deleteCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        addCustomer,
        addOrder,
        updateOrder,
        updateSuratJalan,
        checkoutOrder,
        completeOrder,
        cancelOrder,
        getNextInvoiceId,
        adjustStock,
        archiveOrder,
        deleteOrder,
        refresh,
      }), [
        hasCurrentUserData, categories, products, customers, orders, movements, loading, error,
        addCategory, updateCategory, deleteCategory, addProduct, updateProduct,
        deleteProduct, addCustomer, addOrder, updateOrder, updateSuratJalan,
        checkoutOrder, completeOrder, cancelOrder, getNextInvoiceId, adjustStock,
        archiveOrder, deleteOrder, refresh,
      ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
