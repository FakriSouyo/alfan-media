// ─────────────────────────────────────────────────────────────────────────────
// Tool registry for the LLM.
//
// `TOOL_DEFS` is the OpenAI `tools` array sent to the model. `executeTool`
// maps a (name, args) pair from the model to the validated, risk-checked
// tool implementations in src/lib/agent/tools/*. The model's arguments are
// NEVER trusted — every parameter is re-validated here before execution.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type BulkDeleteResult,
  type CreateProductResult,
  type DeleteProductResult,
  previewZeroStock,
  runCreateProduct,
  runGetProduct,
  runSearchProducts,
  runUpdateProduct,
  type ProductView,
} from "../tools/products";
import {
  type SalesSummary,
  periodLabel,
  runGetSales,
  runGetSalesSummary,
  runGetTopSelling,
  runGetTodaySales,
} from "../tools/sales";
import { runGetLowStock, runGetStock, runUpdateStock } from "../tools/stock";
import {
  type ReportData,
  runDailyReport,
  runMonthlyReport,
  runSalesReport,
} from "../tools/reports";
import { NAV_DESTINATIONS, navTo, type NavDestination } from "../tools/navigation";
import {
  type PeriodSpec,
  validateUpdateStock,
} from "../schemas/tools";
import type {
  NavigateAction,
  ToolContext,
  ToolFailure,
  ToolResult,
} from "../types";

export const PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
] as const;

export function periodFromName(value: unknown): PeriodSpec {
  return (PERIODS as readonly string[]).includes(String(value))
    ? { kind: value as PeriodSpec["kind"] }
    : { kind: "this_month" };
}

// ─── Schemas (what the model sees) ───────────────────────────────────────────

export interface LlmToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const NAV_DEST_NAMES = Object.keys(NAV_DESTINATIONS) as NavDestination[];

export const TOOL_DEFS: LlmToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_today_sales",
      description: "Penjualan HARI INI (transaksi yang sudah selesai/COMPLETED): jumlah transaksi, omzet, item terjual, produk terlaris.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales",
      description: "Ringkasan penjualan untuk periode tertentu (hanya transaksi COMPLETED).",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: [...PERIODS],
            description: "Periode: today, yesterday, this_week, last_week, this_month, last_month, this_year, last_year.",
          },
        },
        required: ["period"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Ringkasan penjualan + perbandingan dengan periode sebelumnya (delta persentase).",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: [...PERIODS] },
        },
        required: ["period"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_selling_products",
      description: "Produk terlaris (agregat kuantitas per produk) untuk suatu periode.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: [...PERIODS] },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["period"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock",
      description: "Daftar stok semua produk, terurut dari stok terendah.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 500 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_products",
      description: "Produk yang stoknya di bawah ambang (stok menipis).",
      parameters: {
        type: "object",
        properties: {
          threshold: { type: "integer", minimum: 0, maximum: 1000, description: "Ambang stok; default 5." },
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "Detail satu produk berdasarkan id (id diperoleh dari hasil search_products).",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "UUID produk." } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Cari produk berdasarkan kata kunci nama atau barcode. Kembalikan kandidat beserta id-nya.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Kata kunci nama atau barcode 12–14 digit." },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description:
        "Buat produk baru lengkap dengan harga jual (tier Normal) dan stok awal. WAJIB tanyakan ke pengguna semua info yang belum ada (nama, kategori, kelas, barcode, harga jual, stok) sebelum memanggil tool ini. Konvensi rak LKS: kategori = mapel, level = kelas, nama = judul lengkap yang membedakan buku di rak yang sama.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Judul lengkap buku — harus Membedakan dari buku lain di rak yang sama (sertakan penerbit/kurikulum/edisi bila perlu). JANGAN hanya mengulang nama kategori. Mis: 'Matematika SMA Kelas X Semester 1 — Kurikulum Merdeka (Erlangga)' untuk kategori 'Matematika' level 'SMA I'.",
          },
          category: {
            type: "string",
            description: "Nama mapel/rak (mis. 'Matematika'). Kelas tidak ditulis di sini — pakai parameter level. Dibuat otomatis jika belum ada.",
          },
          level: {
            type: "string",
            enum: [
              "SD", "SMP", "SMA",
              "SD I", "SD II", "SD III", "SD IV", "SD V", "SD VI",
              "SMP I", "SMP II", "SMP III",
              "SMA I", "SMA II", "SMA III",
            ],
            description:
              "Kelas buku (rak). Peta romawi: SMP I=VII, II=VIII, III=IX; SMA I=X, II=XI, III=XII. Ikuti format rak yang sudah ada di toko (lihat hasil search, mis. 'Matematika (SMA)' → level 'SMA'); rak baru pakai jenjang+kelas. WAJIB bila bukunya punya kelas; tanyakan dulu bila belum jelas.",
          },
          barcode: { type: "string", description: "12–14 digit angka." },
          sellingPrice: { type: "integer", description: "Harga jual dalam Rupiah (angka penuh, mis. 50000)." },
          stock: { type: "integer", minimum: 0, description: "Stok awal." },
          description: { type: "string" },
          publishedYear: { type: "integer", description: "Tahun terbit (default: tahun berjalan)." },
          semester: { type: "string", enum: ["Ganjil", "Genap"], description: "Default: Ganjil." },
        },
        required: ["name", "category", "barcode", "sellingPrice", "stock"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_product",
      description: "Perbarui data atau harga jual produk (satu produk). Id harus dari hasil search_products.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          price: { type: "integer", description: "Harga jual baru (Rupiah) pada tier default." },
          name: { type: "string" },
          description: { type: "string" },
          publishedYear: { type: "integer" },
          semester: { type: "string", enum: ["Ganjil", "Genap"] },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_stock",
      description: "Penyesuaian stok satu produk: tambah/kurang (delta) atau set mutlak (setTo).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          delta: { type: "integer", description: "Perubahan (positif masuk, negatif keluar). Jangan gabung dengan setTo." },
          setTo: { type: "integer", minimum: 0, description: "Target stok mutlak." },
          reference: { type: "string", description: "Catatan singkat alasan penyesuaian." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_zero_stock_products",
      description: "Daftar produk yang stoknya 0 (preview sebelum penghapusan massal).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_product",
      description:
        "Hapus SATU produk (id dari search_products). Operasi ini TIDAK bisa dibatalkan — sistem akan meminta persetujuan pengguna (approval) sebelum dieksekusi.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_delete_zero_stock",
      description:
        "Hapus SEMUA produk yang stoknya 0 (hanya admin). Selalu lewat approval pengguna. Panggil list_zero_stock_products dulu agar Anda dan pengguna tahu apa yang akan dihapus.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report",
      description: "Laporan penjualan: harian (hari ini), bulanan (bulan ini vs bulan lalu), atau periode umum.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["daily", "monthly", "sales"] },
          period: { type: "string", enum: [...PERIODS], description: "Untuk kind=sales (default this_month)." },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description:
        "Arahkan pengguna ke halaman aplikasi tertentu (tombol navigasi). Gunakan ketika pengguna minta membuka/dilihat halaman tertentu.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", enum: NAV_DEST_NAMES },
          label: { type: "string", description: "Label tombol, mis. 'Lihat Inventori'." },
          description: { type: "string" },
        },
        required: ["destination", "label"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Execution ───────────────────────────────────────────────────────────────

export type ToolExecutorResult =
  | { status: "ok"; data: unknown }
  | { status: "error"; code: ToolFailure["code"]; message: string; candidates?: ToolFailure["candidates"] }
  | { status: "action"; action: NavigateAction };

/**
 * Batas waktu eksekusi SATU tool (kontrak: setiap tool punya timeout).
 * Query Supabase yang menggantung tidak boleh menahan loop LLM.
 */
const TOOL_TIMEOUT_MS = 15_000;

function withToolTimeout(p: Promise<ToolExecutorResult>): Promise<ToolExecutorResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<ToolExecutorResult>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject({
          status: "error" as const,
          code: "TIMEOUT" as const,
          message: `Operasi melebihi batas waktu ${TOOL_TIMEOUT_MS / 1000} detik.`,
        }),
      TOOL_TIMEOUT_MS,
    );
  });
  const raced = Promise.race([p, watchdog]);
  p.catch(() => undefined);
  watchdog.catch(() => undefined);
  return raced.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const TOOL_LABELS: Record<string, string> = {
  get_today_sales: "Menghitung penjualan hari ini",
  get_sales: "Mengambil data penjualan",
  get_sales_summary: "Membuat ringkasan penjualan",
  get_top_selling_products: "Menghitung produk terlaris",
  get_stock: "Membaca data stok",
  get_low_stock_products: "Mencari stok menipis",
  get_product: "Mengambil detail produk",
  search_products: "Mencari produk",
  create_product: "Membuat produk baru",
  update_product: "Memperbarui produk",
  update_stock: "Menyesuaikan stok",
  list_zero_stock_products: "Mendaftar produk stok 0",
  delete_product: "Menyiapkan penghapusan produk",
  bulk_delete_zero_stock: "Menyiapkan penghapusan massal",
  get_report: "Membuat laporan",
  navigate: "Menyiapkan navigasi",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Menjalankan ${name}`;
}

function mapFailure(f: ToolFailure): ToolExecutorResult {
  return { status: "error", code: f.code, message: f.message, candidates: f.candidates };
}

function navFromParams(args: Record<string, unknown>): ToolExecutorResult {
  const dest = args.destination;
  const label = typeof args.label === "string" ? args.label.trim().slice(0, 60) : "Buka";
  if (typeof dest === "string" && (NAV_DEST_NAMES as string[]).includes(dest)) {
    const description =
      typeof args.description === "string" ? args.description.trim().slice(0, 120) : undefined;
    return { status: "action", action: navTo(dest as NavDestination, label, description) };
  }
  return {
    status: "error",
    code: "VALIDATION",
    message: `Destinasi tidak valid. Gunakan salah satu dari: ${NAV_DEST_NAMES.join(", ")}.`,
  };
}

async function runCreateProductSafe(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult<CreateProductResult>> {
  const currentYear = new Date().getFullYear();
  return await runCreateProduct(
    {
      ...args,
      publishedYear: typeof args.publishedYear === "number" ? args.publishedYear : currentYear,
      semester: args.semester === "Genap" ? "Genap" : "Ganjil",
      description: typeof args.description === "string" ? args.description : "",
    },
    ctx,
  );
}

async function runUpdateStockSafe(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult<unknown>> {
  const v = validateUpdateStock({
    ...args,
    reference:
      typeof args.reference === "string" && args.reference.trim()
        ? args.reference
        : "Penyesuaian stok melalui AI assistant",
  });
  if (!v.ok) return { ok: false, code: "VALIDATION", message: v.errors[0].message };
  return await runUpdateStock(v.value, ctx);
}

/**
 * Execute one tool call from the model. Unknown tools / invalid params never
 * reach Supabase. `delete_product` and `bulk_delete_zero_stock` are handled by
 * the orchestrator (approval gate) — they are intentionally not executed here.
 */
export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  try {
    return await withToolTimeout(executeToolInner(name, args, ctx));
  } catch (e) {
    // withToolTimeout reject dengan objek terstruktur saat timeout.
    if (e && typeof e === "object" && "status" in e) return e as ToolExecutorResult;
    console.error(`[llm.tools] ${name}:`, e instanceof Error ? e.message : e);
    return { status: "error", code: "DB_ERROR", message: "Terjadi kesalahan saat menjalankan operasi." };
  }
}

async function executeToolInner(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutorResult> {
  try {
    switch (name) {
      case "get_today_sales": {
        const r = await runGetTodaySales(ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "get_sales": {
        const period = periodFromName(args.period);
        const r = await runGetSales(period, ctx, 5);
        return r.ok ? { status: "ok", data: { ...r.data, periodLabel: periodLabel(period) } } : mapFailure(r);
      }
      case "get_sales_summary": {
        const period = periodFromName(args.period);
        const r = await runGetSalesSummary(period, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "get_top_selling_products": {
        const limit =
          typeof args.limit === "number" && Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 20
            ? args.limit
            : 5;
        const r = await runGetTopSelling(periodFromName(args.period), ctx, limit);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "get_stock": {
        const limit =
          typeof args.limit === "number" && Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 500
            ? args.limit
            : 100;
        const r = await runGetStock(ctx, limit);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "get_low_stock_products": {
        const threshold =
          typeof args.threshold === "number" && Number.isInteger(args.threshold) && args.threshold >= 0 && args.threshold <= 1000
            ? args.threshold
            : 5;
        const limit =
          typeof args.limit === "number" && Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 200
            ? args.limit
            : 50;
        const r = await runGetLowStock({ threshold, limit }, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "get_product": {
        const r = await runGetProduct({ id: args.id }, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "search_products": {
        const r = await runSearchProducts(
          { query: args.query, limit: typeof args.limit === "number" ? args.limit : 12 },
          ctx,
        );
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "create_product": {
        const r = await runCreateProductSafe(args, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "update_product": {
        const r = await runUpdateProduct(args, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "update_stock": {
        const r = await runUpdateStockSafe(args, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "list_zero_stock_products": {
        const r = await previewZeroStock(ctx);
        return r.ok ? { status: "ok", data: { items: r.items } } : mapFailure(r);
      }
      case "get_report": {
        const kind = args.kind;
        const period = periodFromName(args.period);
        const r =
          kind === "daily"
            ? await runDailyReport(ctx)
            : kind === "monthly"
              ? await runMonthlyReport(period.kind === "today" ? { kind: "this_month" } : period, ctx)
              : await runSalesReport(period, ctx);
        return r.ok ? { status: "ok", data: r.data } : mapFailure(r);
      }
      case "navigate":
        return navFromParams(args);
      case "delete_product":
      case "bulk_delete_zero_stock":
        // Must go through the approval gate in the orchestrator.
        return {
          status: "error",
          code: "VALIDATION",
          message: "Operasi ini memerlukan persetujuan pengguna.",
        };
      default:
        return { status: "error", code: "VALIDATION", message: `Tool tidak dikenal: ${String(name).slice(0, 60)}` };
    }
  } catch (e) {
    console.error(`[llm.tools] ${name}:`, e instanceof Error ? e.message : e);
    return { status: "error", code: "DB_ERROR", message: "Terjadi kesalahan saat menjalankan operasi." };
  }
}

// Re-exported for the orchestrator's block builders.
export type {
  BulkDeleteResult,
  DeleteProductResult,
  ProductView,
  ReportData,
  SalesSummary,
};
