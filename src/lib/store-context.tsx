"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  Category,
  Product,
  Customer,
  Order,
  OrderItem,
  StockMovement,
  SuratJalan,
} from "./types";
import { getSupabaseBrowserClient } from "./supabase/browser";
import { formatError } from "./error-log";

// ─── Shape DB row (snake_case) → TS type (camelCase) ───────────────────────
type CategoryRow = {
  id: string;
  name: string;
  level: "SD" | "SMP" | "SMA" | null;
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

  // Categories
  addCategory: (name: string, description: string, level?: string) => Promise<Category | null>;
  updateCategory: (id: string, name: string, description: string, level?: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Products
  addProduct: (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product | null>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
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
  adjustStock: (productId: string, qty: number, reference: string) => Promise<void>;

  // Manual refresh (opsional)
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Fetcher: load semua data sekaligus (parallel) ─────────────────────
  const refresh = useCallback(async () => {
    const [cats, prods, prices, custs, ords, items, moves, sjs] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("product_prices").select("*"),
      supabase.from("customers").select("*").order("name"),
      supabase.from("orders").select("*").order("order_date", { ascending: false }),
      supabase.from("order_items").select("*"),
      supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
      supabase.from("surat_jalans").select("*"),
    ]);

    if (cats.data) setCategories((cats.data as CategoryRow[]).map(toCategory));
    if (prods.data && prices.data) {
      const priceRows = prices.data as ProductPriceRow[];
      const productRows = prods.data as ProductRow[];
      setProducts(
        productRows.map((p) => toProduct(p, priceRows.filter((pr) => pr.product_id === p.id)))
      );
    }
    if (custs.data) setCustomers((custs.data as CustomerRow[]).map(toCustomer));
    if (ords.data) {
      const orderRows = ords.data as OrderRow[];
      const itemRows = (items.data ?? []) as OrderItemRow[];
      const sjRows = (sjs.data ?? []) as SuratJalanRow[];
      setOrders(
        orderRows.map((o) => {
          const sj = sjRows.find((s) => s.order_id === o.id);
          return toOrder(
            o,
            itemRows.filter((i) => i.order_id === o.id),
            sj ? toSuratJalan(sj) : undefined
          );
        })
      );
    }
    if (moves.data) setMovements((moves.data as StockMovementRow[]).map(toMovement));
  }, [supabase]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

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
        return;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name, description, level } : c))
      );
    },
    [supabase]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) {
        console.error(formatError(error, "deleteCategory"));
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
    },
    [supabase]
  );

  // ─── Products ──────────────────────────────────────────────────────────
  const addProduct = useCallback(
    async (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
      // Insert produk dulu. Catatan penting (pasca-migrasi Supabase):
      // `products.stock` dihitung ulang dari `stock_movements` oleh trigger
      // `sync_product_stock()` — tabel stok TIDAK boleh ditulis langsung.
      // Jadi stok awal harus dicatat sebagai movement `INITIAL` di bawah.
      const { data: prodRow, error: prodErr } = await supabase
        .from("products")
        .insert({
          name: p.name,
          category_id: p.categoryId || null,
          barcode: p.barcode,
          description: p.description,
          published_year: p.publishedYear,
          semester: p.semester,
          stock: 0,
          cost_price: p.costPrice ?? 0,
          image_path: p.imagePath ?? null,
        })
        .select()
        .single();
      if (prodErr || !prodRow) {
        console.error(formatError(prodErr, "addProduct"));
        return null;
      }

      // Stok awal → movement INITIAL (sumber kebenaran stok). Trigger akan
      // otomatis meng-update products.stock = SUM(movements).
      if (p.stock > 0) {
        const { error: stockErr } = await supabase.from("stock_movements").insert({
          product_id: prodRow.id,
          type: "INITIAL",
          quantity: p.stock,
          reference: "Stock awal",
          notes: "Stok awal saat produk dibuat",
        });
        if (stockErr) console.error(formatError(stockErr, "addProduct initial stock"));
      }

      // Insert prices (bulk)
      if (p.prices.length > 0) {
        const { error: priceErr } = await supabase.from("product_prices").insert(
          p.prices.map((pr) => ({
            product_id: prodRow.id,
            tier_name: pr.tierName,
            price: pr.price,
            is_default: pr.isDefault,
          }))
        );
        if (priceErr) console.error(formatError(priceErr, "addProduct prices"));
      }

      const created = toProduct(prodRow as ProductRow, p.prices.map((pr, i) => ({
        id: `temp-${i}`,
        product_id: prodRow.id,
        tier_name: pr.tierName,
        price: pr.price,
        is_default: pr.isDefault,
      })));
      setProducts((prev) => [...prev, created]);
      // Refresh untuk dapat UUID asli dari prices (dan stok hasil trigger).
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

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("products").update(patch).eq("id", id);
        if (error) {
          console.error(formatError(error, "updateProduct"));
          return;
        }
      }

      // Ganti seluruh prices kalau dikirim
      if (p.prices !== undefined) {
        await supabase.from("product_prices").delete().eq("product_id", id);
        if (p.prices.length > 0) {
          await supabase.from("product_prices").insert(
            p.prices.map((pr) => ({
              product_id: id,
              tier_name: pr.tierName,
              price: pr.price,
              is_default: pr.isDefault,
            }))
          );
        }
      }

      await refresh();
    },
    [supabase, refresh]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        console.error(formatError(error, "deleteProduct"));
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
        return null;
      }
      const created = toCustomer(data as CustomerRow);
      setCustomers((prev) => [...prev, created]);
      return created;
    },
    [supabase]
  );

  // ─── Stock ─────────────────────────────────────────────────────────────
  // Dipakai oleh addOrder (checkout walk-in), checkoutOrder (draft→proses),
  // dan completeOrder (legacy).
  // Mencatat stock_movements SALE & mengurangi stok. Trigger sync_product_stock
  // di DB akan otomatis update products.stock.
  // ANTI-OVERSELL: stok dicek dari DB sebelum movement SALE dicatat.
  // Kurang → return false, TIDAK ADA pengurangan (parcial atau penuh).
  const deductStockAndRecord = useCallback(
    async (orderInvoiceNo: string): Promise<boolean> => {
      const { data: order, error: findErr } = await supabase
        .from("orders")
        .select("id, items:order_items(*)")
        .eq("invoice_no", orderInvoiceNo)
        .single();
      if (findErr || !order) return false;

      const items = (order as unknown as { items: OrderItemRow[] }).items ?? [];
      const productIds = [
        ...new Set(items.map((i) => i.product_id).filter((x): x is string => Boolean(x))),
      ];
      if (productIds.length > 0) {
        const { data: prodRows } = await supabase
          .from("products")
          .select("id, stock")
          .in("id", productIds);
        const stockOf = new Map<string, number>(
          (prodRows ?? []).map((p: { id: string; stock: number }) => [p.id, p.stock]),
        );
        const short = items.filter(
          (i) => !i.product_id || (stockOf.get(i.product_id) ?? 0) < i.quantity,
        );
        if (short.length > 0) {
          console.error(
            `[oversell] ${orderInvoiceNo}: ${short
              .map(
                (s) =>
                  `${s.product_name} (stok ${s.product_id ? stockOf.get(s.product_id) ?? 0 : "?"} < ${s.quantity})`,
              )
              .join(", ")}`,
          );
          return false;
        }
      }

      for (const item of items) {
        if (!item.product_id) continue;
        const { error } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          type: "SALE",
          quantity: -item.quantity,
          reference: orderInvoiceNo,
        });
        if (error) return false;
      }
      return true;
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
      const invoice = await getNextInvoiceId();

      // Insert order
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          invoice_no: invoice,
          order_date: o.date,
          customer_id: o.customerId || null,
          customer_name: o.customerName,
          subtotal: o.subtotal,
          discount: o.discount,
          total: o.total,
          status: o.status,
        })
        .select()
        .single();
      if (orderErr || !orderRow) {
        console.error(formatError(orderErr, "addOrder"));
        return null;
      }

      // Insert items (bulk)
      if (o.items.length > 0) {
        const { error: itemsErr } = await supabase.from("order_items").insert(
          o.items.map((i) => ({
            order_id: orderRow.id,
            product_id: i.productId || null,
            product_name: i.productName,
            product_barcode: i.productBarcode,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            price_tier: i.priceTier,
            custom_price: i.customPrice,
            discount_percent: i.discountPercent,
            subtotal: i.subtotal,
            // Snapshot modal saat dijual agar laba memakai modal yang berlaku
            // sekarang, bukan modal yang mungkin berubah setelahnya.
            cost_price:
              i.costPrice ??
              products.find((pr) => pr.id === i.productId)?.costPrice ??
              0,
          }))
        );
        if (itemsErr) console.error(formatError(itemsErr, "addOrder items"));
      }

      // Surat jalan kalau dikirim
      if (o.suratJalan) {
        await supabase.from("surat_jalans").insert({
          order_id: orderRow.id,
          no: o.suratJalan.no,
          tanggal: o.suratJalan.tanggal,
          pengirim: o.suratJalan.pengirim,
          penerima: o.suratJalan.penerima,
          estimasi: o.suratJalan.estimasi,
          nama_pengirim: o.suratJalan.namaPengirim,
          kendaraan: o.suratJalan.kendaraan,
          catatan: o.suratJalan.catatan,
        });
      }

      // Alur baru: stok TERPOTONG saat pesanan masuk proses (CHECKED_OUT).
      // Checkout walk-in membuat order langsung CHECKED_OUT → potong di sini.
      let finalStatus = o.status;
      if (o.status === "CHECKED_OUT") {
        const ok = await deductStockAndRecord(invoice);
        if (!ok) {
          // Stok tak cukup: jangan hilangkan pesanan — kembalikan jadi DRAFT.
          console.error(`[oversell] ${invoice} ditolak, dikembalikan ke DRAFT`);
          await supabase.from("orders").update({ status: "DRAFT" }).eq("invoice_no", invoice);
          finalStatus = "DRAFT";
        }
      }

      await refresh();
      // Kembalikan Order dengan id = invoice_no (konsisten dengan store lama)
      return {
        ...o,
        status: finalStatus,
        id: invoice,
        revisions: [],
        createdAt: orderRow.created_at,
        updatedAt: orderRow.updated_at,
      };
    },
    [supabase, getNextInvoiceId, refresh, deductStockAndRecord, products]
  );

  const updateOrder = useCallback(
    async (id: string, patch: Partial<Order>) => {
      // Cari UUID internal order dari invoice_no
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) {
        console.error(formatError(findErr, "updateOrder find"));
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
          return;
        }
      }
      await refresh();
    },
    [supabase, refresh]
  );

  const updateSuratJalan = useCallback(
    async (id: string, data: Partial<SuratJalan>) => {
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id, customer_name, order_date")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) return;

      // Cek apakah surat jalan sudah ada
      const { data: existing } = await supabase
        .from("surat_jalans")
        .select("*")
        .eq("order_id", row.id)
        .maybeSingle();

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
        await supabase
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
      } else {
        await supabase.from("surat_jalans").insert({
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
      }
      await refresh();
    },
    [supabase, refresh]
  );

  // ─── Status transitions ────────────────────────────────────────────────
  // DRAFT →(checkoutOrder)→ CHECKED_OUT →(completeOrder)→ COMPLETED (final).
  // Stok terpotong saat MASUK PROSES (→ CHECKED_OUT), bukan saat selesai.
  const checkoutOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const order = orders.find((o) => o.id === id);
      if (!order || order.status !== "DRAFT") return false;
      if (!(await deductStockAndRecord(id))) return false;
      const { error } = await supabase
        .from("orders")
        .update({ status: "CHECKED_OUT" })
        .eq("invoice_no", id);
      if (error) {
        console.error(formatError(error, "checkoutOrder"));
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, deductStockAndRecord, refresh, orders]
  );

  const completeOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const order = orders.find((o) => o.id === id);
      if (!order || order.status !== "CHECKED_OUT") return false;
      // Legacy: pesanan CHECKED_OUT yang dibuat sebelum alur ini stoknya
      // belum terpotong (dulu dipotong saat selesai) → potong di sini.
      const { data: movs } = await supabase
        .from("stock_movements")
        .select("type")
        .eq("reference", id);
      const alreadyDeducted = (movs ?? []).some((m: { type: string }) => m.type === "SALE");
      if (!alreadyDeducted && !(await deductStockAndRecord(id))) return false;
      const { error } = await supabase
        .from("orders")
        .update({ status: "COMPLETED" })
        .eq("invoice_no", id);
      if (error) {
        console.error(formatError(error, "completeOrder"));
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, deductStockAndRecord, refresh, orders]
  );

  const cancelOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const order = orders.find((o) => o.id === id);
      if (!order) return false;
      // COMPLETED bersifat FINAL: buku penjualan & riwayat tidak berubah.
      // Koreksi kesalahan lewat penyesuaian stok, bukan membatalkan.
      if (order.status === "COMPLETED") {
        console.error(`[cancel] ${id} ditolak: pesanan COMPLETED bersifat final`);
        return false;
      }
      // CHECKED_OUT: stok sudah terpotong saat masuk proses → kembalikan
      // (hanya bila memang terpotong — pesanan legacy belum dipotong).
      if (order.status === "CHECKED_OUT") {
        const { data: movs } = await supabase
          .from("stock_movements")
          .select("type")
          .eq("reference", id);
        if ((movs ?? []).some((m: { type: string }) => m.type === "SALE")) {
          for (const item of order.items) {
            if (!item.productId) continue;
            await supabase.from("stock_movements").insert({
              product_id: item.productId,
              type: "RETURN",
              quantity: item.quantity,
              reference: id,
            });
          }
        }
      }

      const { error } = await supabase
        .from("orders")
        .update({ status: "CANCELLED" })
        .eq("invoice_no", id);
      if (error) {
        console.error(formatError(error, "cancelOrder"));
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, refresh, orders]
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
      if (findErr || !row) return;
      const { error } = await supabase.from("orders").update({ archived }).eq("id", row.id);
      if (error) console.error(formatError(error, "archiveOrder"));
      await refresh();
    },
    [supabase, refresh]
  );

  // Hapus permanen: orders ON DELETE CASCADE akan menghapus order_items,
  // surat_jalans, order_revisions, dll. Stock movements yang merujuk invoice
  // (reference = invoice_no) ikut dibersihkan manual agar stok kembali sinkron.
  const deleteOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const { data: row, error: findErr } = await supabase
        .from("orders")
        .select("id")
        .eq("invoice_no", id)
        .single();
      if (findErr || !row) {
        console.error(formatError(findErr, "deleteOrder find"));
        return false;
      }
      // Hapus movements SALE/RETURN/CANCELLED_ORDER yang terikat invoice ini terlebih dulu
      // agar trigger sync_product_stock menghitung ulang stok dengan benar.
      await supabase.from("stock_movements").delete().eq("reference", id);
      const { error } = await supabase.from("orders").delete().eq("id", row.id);
      if (error) {
        console.error(formatError(error, "deleteOrder"));
        return false;
      }
      await refresh();
      return true;
    },
    [supabase, refresh]
  );

  // ─── Stock ─────────────────────────────────────────────────────────────
  const adjustStock = useCallback(
    async (productId: string, qty: number, reference: string) => {
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        type: "ADJUSTMENT",
        quantity: qty,
        reference,
      });
      if (error) console.error(formatError(error, "adjustStock"));
      await refresh();
    },
    [supabase, refresh]
  );

  return (
    <StoreContext.Provider
      value={{
        categories,
        products,
        customers,
        orders,
        movements,
        loading,
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
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
