// ─── Categories ───────────────────────────────────────────────
/** Jenjang pendidikan untuk kategori buku pelajaran. */
export type CategoryLevel = "SD" | "SMP" | "SMA";

export interface Category {
  id: string;
  name: string;
  /** Jenjang + kelas, mis. "SD I", "SMP II", "SMA III". Kategori umum (mis.
   *  novel, komik) tidak punya level — biarkan kosong. */
  level?: string;
  description: string;
  createdAt: string;
}

// ─── Products ─────────────────────────────────────────────────
export interface ProductPrice {
  id: string;
  tierName: string;
  price: number; // in IDR integer (e.g. 50000 = Rp50.000)
  isDefault: boolean;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  barcode: string;
  description: string;
  publishedYear: number;
  semester: "Ganjil" | "Genap";
  stock: number;
  prices: ProductPrice[];
  createdAt: string;
  updatedAt: string;
}

// ─── Customers & Price Tiers ──────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  priceTier: string; // maps to a ProductPrice.tierName
  phone?: string;
  address?: string;
}

// ─── Orders ───────────────────────────────────────────────────
export type OrderStatus = "DRAFT" | "CHECKED_OUT" | "COMPLETED" | "CANCELLED";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productBarcode: string;
  quantity: number;
  unitPrice: number;
  priceTier: string;
  customPrice: number | null;
  discountPercent: number;
  subtotal: number;
}

export interface OrderRevision {
  id: string;
  revisionNumber: number;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  reason: string;
  changedAt: string;
  changedBy: string;
}

export interface Order {
  id: string; // e.g. INV-001
  date: string;
  customerId: string | null;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  suratJalan?: SuratJalan;
  revisions: OrderRevision[];
  createdAt: string;
  updatedAt: string;
}

// ─── Stock Movements ──────────────────────────────────────────
export type MovementType = "INITIAL" | "SALE" | "ADJUSTMENT" | "RETURN" | "CANCELLED_ORDER";

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number; // positive = in, negative = out
  reference: string; // order id or adjustment note
  createdAt: string;
}

// ─── Documents ────────────────────────────────────────────────
export interface Document {
  id: string;
  orderId: string;
  type: "NOTA" | "SURAT_JALAN";
  number: string;
  createdAt: string;
}

// ─── Surat Jalan ─────────────────────────────────────────────
/** Data surat izin jalan yang bisa diedit, tersimpan per pesanan. */
export interface SuratJalan {
  no: string;
  /** Tanggal jalan / tanggal kirim (bisa berbeda dari tanggal pesanan). */
  tanggal: string;
  pengirim: string;
  penerima: string;
  /** Estimasi pengiriman / waktu tiba, opsional. */
  estimasi: string;
  /** Nama orang pengirim (kurir), opsional. */
  namaPengirim: string;
  /** Nomor kendaraan pengiriman, opsional. */
  kendaraan: string;
  catatan: string;
}

// ─── Users ────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
}
