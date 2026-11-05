
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { AiSettingsCard } from "@/components/settings/ai-settings-card";
import { useTheme } from "@/lib/theme-context";
import { Link } from "@/lib/navigation";
import { Moon, Sun, Download, Loader2, FileJson, Check, ArrowUpRight } from "lucide-react";
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

  const { theme, setTheme } = useTheme();

  const [downloading, setDownloading] = useState(false);
  const [lastDownloadAt, setLastDownloadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

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
          const rows: Record<string, unknown>[] = [];
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from(table).select("*").order(EXPORT_ORDER_COLUMN[table], { ascending: true }).order(table === "settings" ? "key" : "id", { ascending: true }).range(offset, offset + 999);
            if (error) throw new Error(`${table}: ${error.message}`);
            rows.push(...(data ?? []));
            if ((data ?? []).length < 1000) break;
          }
          return [table, rows] as const;
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

  return <div className="workspace-page max-w-6xl">
    <PageHeader title="Pengaturan" description="Sesuaikan ruang kerja, kelola asisten, dan simpan salinan data toko." />
    <nav className="workspace-tabs" aria-label="Bagian pengaturan"><a href="#appearance">Tampilan</a><a href="#account">Akun</a><a href="#ai">Asisten AI</a><a href="#backup">Data toko</a></nav>
    <section id="appearance" className="settings-section scroll-mt-20"><header><h2>Tampilan</h2><p>Pilih suasana yang nyaman untuk bekerja. Pilihan tersimpan di perangkat ini.</p></header><div className="grid max-w-lg grid-cols-2 gap-4"><button aria-pressed={theme==="light"} onClick={()=>setTheme("light")} className="theme-choice"><span className="theme-preview" aria-hidden="true"><i /><i /></span><span className="flex items-center gap-2"><Sun size={16} />Terang {theme==="light" && <Check size={15} />}</span></button><button aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")} className="theme-choice"><span className="theme-preview theme-preview-dark" aria-hidden="true"><i /><i /></span><span className="flex items-center gap-2"><Moon size={16} />Gelap {theme==="dark" && <Check size={15} />}</span></button></div></section>
    <section id="account" className="settings-section scroll-mt-20"><header><h2>Akun</h2><p>Informasi akun yang digunakan untuk mengelola toko.</p></header><div className="min-w-0"><div className="flex flex-wrap items-center gap-4"><div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 font-serif text-2xl text-primary">{user?.name?.charAt(0)}</div><div className="min-w-0"><p className="text-sm font-semibold">{user?.name}</p><p className="mt-1 break-all text-xs text-muted-foreground">{user?.email}</p><p className="mt-1 text-xs text-muted-foreground">{user?.role==="admin"?"Administrator":"Staf toko"}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/profile" className="workspace-button">Lihat profil <ArrowUpRight size={15} /></Link><button onClick={()=>void logout()} className="workspace-button">Keluar</button></div></div></section>
    <section id="ai" className="settings-section scroll-mt-20"><header><h2>Asisten AI</h2><p>Atur koneksi dan model yang membantu pekerjaan harian toko.</p></header><div className="min-w-0"><AiSettingsCard isAdmin={user?.role==="admin"} /></div></section>
    <section id="backup" className="settings-section scroll-mt-20"><header><h2>Data toko</h2><p>Unduh salinan kategori, produk, pesanan, pelanggan, dan pergerakan stok.</p></header><div className="min-w-0"><div className="flex items-start gap-3"><FileJson size={24} className="mt-1 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">Cadangan data operasional</h3><p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">Tersimpan sebagai satu file JSON di perangkat Anda. Berisi data dari {EXPORT_TABLES.length} tabel operasional.</p></div></div><button onClick={()=>void downloadJson()} disabled={downloading} className="workspace-button workspace-button-primary mt-5">{downloading?<Loader2 size={16} className="animate-spin" />:<Download size={16} />}{downloading?"Menyiapkan unduhan…":"Unduh data JSON"}</button>
      {lastDownloadAt && !error && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-primary"><Check size={14} />Berhasil diunduh {lastDownloadAt}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} Silakan coba unduh kembali.</p>}
      {counts && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 text-xs font-semibold">Isi cadangan terakhir</h3><dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{EXPORT_TABLES.map(table=><div key={table} className="flex items-center justify-between gap-3 text-xs"><dt className="text-muted-foreground">{table}</dt><dd className="tabular-nums">{counts[table]<0?"Tidak tersedia":counts[table]}</dd></div>)}</dl></div>}
    </div></section>
  </div>;
}
