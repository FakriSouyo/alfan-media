"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { AiSettingsCard } from "@/components/settings/ai-settings-card";
import { Moon, Sun, Download, Loader2, FileJson, Check } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Tabel yang di-export (urutan penting: parent dulu, child kemudian,
// supaya file JSON mudah dibaca dan bisa di-restore manual jika perlu).
const EXPORT_TABLES = [
  "categories",
  "customers",
  "products",
  "product_prices",
  "orders",
  "order_items",
  "surat_jalans",
  "stock_movements",
  "documents",
  "settings",
] as const;

// Kolom yang dipakai untuk mengurutkan saat export, per tabel. Semua tabel
// punya `created_at` KECUALI `settings` (hanya `key`, `value`, `updated_at`) —
// mengurutkan `settings` berdasarkan `created_at` membuat PostgREST melempar
// error 42703 dan menggagalkan seluruh export. Pakai `updated_at` untuk itu.
const EXPORT_ORDER_COLUMN: Record<(typeof EXPORT_TABLES)[number], string> = {
  categories: "created_at",
  customers: "created_at",
  products: "created_at",
  product_prices: "created_at",
  orders: "created_at",
  order_items: "created_at",
  surat_jalans: "created_at",
  stock_movements: "created_at",
  documents: "created_at",
  settings: "updated_at",
};

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const supabase = getSupabaseBrowserClient();

  // Guard for SSR: `document` is undefined while this client component is being
  // server-rendered. Accessing it directly in a useState initializer crashes the
  // page on first paint, so only read the DOM after the client has mounted.
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  );

  const [downloading, setDownloading] = useState(false);
  const [lastDownloadAt, setLastDownloadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  // Hitung jumlah baris per tabel (ringan, hanya count, untuk preview).
  const loadCounts = async () => {
    const out: Record<string, number> = {};
    await Promise.all(
      EXPORT_TABLES.map(async (t) => {
        const { count, error } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        out[t] = error ? -1 : (count ?? 0);
      })
    );
    setCounts(out);
  };

  const downloadJson = async () => {
    setDownloading(true);
    setError(null);
    try {
      // Fetch semua tabel secara paralel
      const results = await Promise.all(
        EXPORT_TABLES.map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .order(EXPORT_ORDER_COLUMN[table], { ascending: true });
          if (error) throw new Error(`${table}: ${error.message}`);
          return [table, data ?? []] as const;
        })
      );

      const payload = {
        meta: {
          app: "Alfan Media",
          exportedAt: new Date().toISOString(),
          exportedBy: user?.email ?? "unknown",
          schemaVersion: 1,
          tables: EXPORT_TABLES,
        },
        data: Object.fromEntries(results),
      };

      // Serialize + download
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const filename = `tokobuku-backup-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLastDownloadAt(new Date().toLocaleString("id-ID"));
      await loadCounts();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal mengunduh data";
      setError(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Pengaturan" description="Kelola pengaturan aplikasi." />

      <div className="mt-4 max-w-lg space-y-4">
        {/* User */}
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="mb-3 text-[14px] font-semibold text-foreground">Akun</h3>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nama</span>
              <span className="font-medium text-foreground">{user?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium text-foreground capitalize">{user?.role}</span>
            </div>
            <button
              onClick={logout}
              className="mt-3 self-start rounded-lg border border-border px-3 py-2 text-[13px] text-foreground hover:bg-foreground/[0.04]"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="mb-3 text-[14px] font-semibold text-foreground">Tampilan</h3>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-foreground hover:bg-foreground/[0.04]"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Mode Terang" : "Mode Gelap"}
          </button>
        </div>

        {/* AI */}
        <AiSettingsCard isAdmin={user?.role === "admin"} />

        {/* Data — Download JSON */}
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="mb-3 text-[14px] font-semibold text-foreground">Data</h3>

          <div className="flex flex-col gap-2">
            <button
              onClick={downloadJson}
              disabled={downloading}
              className="flex items-center gap-2 self-start rounded-lg border border-border bg-foreground px-3 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {downloading ? "Mengunduh…" : "Download Semua Data (JSON)"}
            </button>

            <p className="text-[11px] text-muted-foreground">
              Mengunduh seluruh data dari Supabase (kategori, produk, pesanan,
              pelanggan, pergerakan stok) dalam satu file JSON. Berguna untuk
              backup manual atau migrasi.
            </p>

            {lastDownloadAt && !error && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Check size={11} /> Berhasil diunduh {lastDownloadAt}
              </p>
            )}

            {error && (
              <p className="mt-1 text-[11px] text-destructive">{error}</p>
            )}
          </div>

          {/* Counts (muncul setelah download) */}
          {counts && (
            <div className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <FileJson size={11} /> Ringkasan data
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                {EXPORT_TABLES.map((t) => (
                  <div key={t} className="flex justify-between">
                    <span className="text-muted-foreground">{t}</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {counts[t] < 0 ? "—" : counts[t]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
