"use client";

import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { PageHeader } from "@/components/page-header";
import { Metrics, SearchField, EmptyPanel } from "@/components/workspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Category, CategoryLevel } from "@/lib/types";

/** Kelas romawi per jenjang: SD I–VI, SMP/MTs/SMA/MA I–III. */
const KELAS_BY_JENJANG: Record<CategoryLevel, string[]> = {
  SD: ["I", "II", "III", "IV", "V", "VI"],
  SMP: ["I", "II", "III"],
  MTs: ["I", "II", "III"],
  SMA: ["I", "II", "III"],
  MA: ["I", "II", "III"],
};

const JENJANG_OPTIONS: CategoryLevel[] = ["SD", "SMP", "MTs", "SMA", "MA"];

export default function CategoriesPage() {
  const { categories, products, addCategory, updateCategory, deleteCategory, loading, error: storeError, refresh } = useStore();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [jenjang, setJenjang] = useState<CategoryLevel | "">("");
  const [kelas, setKelas] = useState("");
  const [error, setError] = useState("");

  // Dialog konfirmasi hapus + info hasil "Tambah Semua Kelas".
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; used: boolean } | null>(null);
  const [addAllInfo, setAddAllInfo] = useState<string | null>(null);

  const levelValue = jenjang && kelas ? `${jenjang} ${kelas}` : "";

  const query = search.trim().toLocaleLowerCase("id-ID");
  const productCounts = new Map<string, number>();
  for (const product of products) {
    productCounts.set(product.categoryId, (productCounts.get(product.categoryId) ?? 0) + 1);
  }

  const groups = new Map<string, Category[]>();
  for (const category of categories) {
    const level = category.level?.trim() ?? "";
    const matchesLevel = !levelFilter || (levelFilter === "general" ? !level : level.split(/\s+/)[0] === levelFilter);
    const matchesSearch = [category.name, category.description, level].some((value) => value.toLocaleLowerCase("id-ID").includes(query));
    if (!matchesLevel || !matchesSearch) continue;
    const key = category.name.trim().toLocaleLowerCase("id-ID");
    const entries = groups.get(key) ?? [];
    entries.push(category);
    groups.set(key, entries);
  }

  const subjects = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "id-ID"));
  const selected = subjects.find(([key]) => key === selectedKey) ?? subjects[0];
  const variants = (selected?.[1] ?? []).slice().sort((a, b) => (a.level ?? "").localeCompare(b.level ?? "", "id-ID"));
  const sharedDescription = variants[0]?.description && variants.every((item) => item.description === variants[0].description)
    ? variants[0].description
    : "";
  const subjectTotal = new Set(categories.map((item) => item.name.trim().toLocaleLowerCase("id-ID"))).size;
  const categorizedCount = products.filter((item) => categories.some((category) => category.id === item.categoryId)).length;
  const emptyCount = categories.filter((item) => !productCounts.get(item.id)).length;
  const selectedProductCount = variants.reduce((total, item) => total + (productCounts.get(item.id) ?? 0), 0);

  const resetForm = () => {
    setName(""); setDesc(""); setJenjang(""); setKelas(""); setEditId(null); setShowForm(false); setError("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Nama kategori wajib diisi"); return; }
    const normalizedName = name.trim().toLocaleLowerCase("id-ID");
    if (categories.some((category) => category.id !== editId &&
      category.name.trim().toLocaleLowerCase("id-ID") === normalizedName &&
      (category.level ?? "") === levelValue)) {
      setError("Kategori dengan nama dan jenjang/kelas tersebut sudah ada");
      return;
    }
    if (editId) {
      const saved = await updateCategory(editId, name.trim(), desc.trim(), levelValue);
      if (!saved) { setError("Kategori gagal disimpan. Periksa koneksi dan coba lagi."); return; }
    } else {
      const created = await addCategory(name.trim(), desc.trim(), levelValue);
      if (!created) { setError("Kategori gagal disimpan. Periksa koneksi dan coba lagi."); return; }
    }
    resetForm();
  };

  const handleEdit = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return;
    setName(c.name); setDesc(c.description);
    // Re-split "SD I" → jenjang "SD", kelas "I" (if present / valid).
    const [j = "", ...rest] = (c.level ?? "").split(" ");
    const k = rest.join(" ");
    setJenjang((JENJANG_OPTIONS as string[]).includes(j) ? (j as CategoryLevel) : "");
    setKelas(KELAS_BY_JENJANG[j as CategoryLevel]?.includes(k) ? k : "");
    setEditId(id); setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const c = categories.find((x) => x.id === id);
    const used = products.some((p) => p.categoryId === id);
    setDeleteTarget({ id, name: [c?.name, c?.level].filter(Boolean).join(" · "), used });
  };

  // Buat sekaligus semua kategori kelas SD I–VI, SMP/MTs/SMA/MA I–III untuk
  // nama yang sedang diisi (tanpa duplikat dengan yang sudah ada).
  const handleAddAllClasses = async () => {
    if (!name.trim()) { setError("Nama kategori wajib diisi untuk menambah semua kelas"); return; }
    const target = name.trim();
    const pending: string[] = [];
    let skipped = 0;
    for (const j of JENJANG_OPTIONS) {
      for (const k of KELAS_BY_JENJANG[j]) {
        const level = `${j} ${k}`;
        const exists = categories.some((c) => c.name.trim().toLocaleLowerCase("id-ID") === target.toLocaleLowerCase("id-ID") && c.level === level);
        if (exists) skipped++;
        else pending.push(level);
      }
    }
    const results = await Promise.allSettled(pending.map((level) => addCategory(target, desc.trim(), level)));
    const added = results.filter((result) => result.status === "fulfilled" && Boolean(result.value)).length;
    const failed = results.length - added;
    resetForm();
    setAddAllInfo(`Hasil untuk "${target}": ${added} berhasil ditambahkan, ${skipped} sudah ada, ${failed} gagal.${failed ? " Periksa pesan kesalahan lalu coba lagi untuk kelas yang belum tersimpan." : ""}`);
  };

  return (
    <div className="workspace-page">
      <PageHeader
        title="Kategori"
        description="Kelompokkan buku per mata pelajaran dan kelas agar rak, katalog, dan laporan tetap rapi."
        actions={<>
          <Link href="/stock/products" className="workspace-button">Lihat katalog</Link>
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className="workspace-button workspace-button-primary">
            <Plus size={16} aria-hidden="true" /> Tambah kategori
          </button>
        </>}
      />

      <Metrics items={[
        { label: "Mata pelajaran", value: subjectTotal },
        { label: "Varian kelas", value: categories.length },
        { label: "Produk terkategori", value: categorizedCount, note: `dari ${products.length} judul` },
        { label: "Kategori kosong", value: emptyCount, note: "Belum berisi produk" },
      ]} />

      {/* Form Modal */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit kategori" : "Tambah kategori"}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
            <div>
              <label htmlFor="category-name" className="mb-1.5 block text-xs font-medium text-foreground">Nama kategori</label>
              <input id="category-name" required value={name} onChange={(e) => { setName(e.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby="category-name-hint" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <p id="category-name-hint" role={error ? "alert" : undefined} className={"mt-1.5 text-xs leading-relaxed " + (error ? "text-destructive" : "text-muted-foreground")}>
                {error || "Tulis mata pelajarannya saja, lalu pilih kelas. Contoh: Matematika · SMA · Kelas I."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Jenjang</label>
                <Select value={jenjang} onValueChange={(v) => { setJenjang(v as CategoryLevel | ""); setKelas(""); }}>
                  <SelectTrigger placeholder="Pilih jenjang" className="min-h-11 w-full" />
                  <SelectContent>
                    {JENJANG_OPTIONS.map((j, i) => <SelectItem key={j} index={i} value={j}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Kelas</label>
                <Select value={kelas} onValueChange={setKelas}>
                  <SelectTrigger placeholder={jenjang ? "Pilih kelas" : "Pilih jenjang dulu"} className="min-h-11 w-full" />
                  <SelectContent>
                    {(jenjang ? KELAS_BY_JENJANG[jenjang] : []).map((k, i) => <SelectItem key={k} index={i} value={k}>{`Kelas ${k}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="category-description" className="mb-1.5 block text-xs font-medium text-foreground">Deskripsi <span className="font-normal text-muted-foreground">(opsional)</span></label>
              <textarea id="category-description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="py-2 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            {!editId && (
              <button type="button" onClick={handleAddAllClasses} className="workspace-button w-full flex-wrap border-dashed text-muted-foreground hover:text-foreground">
                <Plus size={15} aria-hidden="true" /> Tambah semua kelas
                <span className="text-xs font-normal">(SD I–VI · SMP/MTs/SMA/MA I–III)</span>
              </button>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={resetForm} className="workspace-button">Batal</button>
              <button type="submit" className="workspace-button workspace-button-primary">{editId ? "Simpan perubahan" : "Tambah kategori"}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {storeError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm">
          <span>{storeError}</span>
          <button type="button" onClick={() => void refresh()} className="workspace-button">Coba lagi</button>
        </div>
      )}

      <section className="workspace-panel">
        <div className="workspace-toolbar">
          <SearchField label="Cari nama, kelas, atau deskripsi" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Filter jenjang" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}
            className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Semua jenjang</option>
            {JENJANG_OPTIONS.map((level) => <option key={level} value={level}>{level}</option>)}
            <option value="general">Tanpa kelas</option>
          </select>
        </div>

        {selected ? (
          <div className="category-layout">
            <label className="category-picker lg:hidden">
              <span>Mata pelajaran <span className="font-normal text-muted-foreground">· {subjects.length} hasil</span></span>
              <select value={selected[0]} onChange={(event) => setSelectedKey(event.target.value)}
                className="mt-2 block h-11 w-full rounded-lg border border-input bg-background px-3">
                {subjects.map(([key, entries]) => <option key={key} value={key}>{entries[0].name} ({entries.length})</option>)}
              </select>
            </label>

            <nav aria-label="Indeks kategori" className="category-index hidden lg:block">
              <div className="category-index-head"><span>Mata pelajaran</span><span className="tabular-nums">{subjects.length}</span></div>
              <ul>
                {subjects.map(([key, entries]) => (
                  <li key={key}>
                    <button type="button" aria-pressed={selected[0] === key} onClick={() => setSelectedKey(key)}>
                      <span className="min-w-0 flex-1 wrap-anywhere">{entries[0].name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{entries.length}</span>
                      <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <section aria-labelledby="category-detail-title" className="min-w-0">
              <header className="category-detail-head">
                <p>Rincian kategori</p>
                <h2 id="category-detail-title" className="wrap-anywhere">{selected[1][0].name}</h2>
                <span className="text-sm text-muted-foreground">{variants.length} varian kelas · {selectedProductCount} produk</span>
                {sharedDescription && <p className="category-description wrap-anywhere">{sharedDescription}</p>}
              </header>
              <ul className="divide-y divide-border">
                {variants.map((category) => {
                  const label = category.level?.trim() || "Tanpa kelas";
                  const count = productCounts.get(category.id) ?? 0;
                  return (
                    <li key={category.id} className="category-variant">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="category-level">{label}</span>
                          <span className={"text-sm tabular-nums " + (count ? "text-foreground" : "text-muted-foreground")}>{count ? `${count} produk` : "Belum ada produk"}</span>
                        </div>
                        {!sharedDescription && category.description && (
                          <details className="mt-2 text-sm text-muted-foreground">
                            <summary className="w-fit cursor-pointer rounded-sm py-1">Lihat deskripsi</summary>
                            <p className="mt-1 max-w-[65ch] wrap-anywhere leading-relaxed">{category.description}</p>
                          </details>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" aria-label={`Edit ${category.name} ${label}`} title="Edit kategori" onClick={() => handleEdit(category.id)} className="workspace-icon"><Pencil size={16} aria-hidden="true" /></button>
                        <button type="button" aria-label={`Hapus ${category.name} ${label}`} title="Hapus kategori" onClick={() => handleDelete(category.id)} className="workspace-icon hover:text-destructive"><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        ) : (
          <div aria-live="polite">
            <EmptyPanel
              title={loading ? "Memuat kategori…" : storeError ? "Kategori belum bisa ditampilkan" : categories.length ? "Kategori tidak ditemukan" : "Belum ada kategori"}
              description={loading ? "Data toko sedang diambil." : storeError ? "Periksa koneksi lalu coba muat ulang." : categories.length ? "Coba kata kunci lain atau reset filter jenjang." : "Tambahkan mata pelajaran pertama untuk mulai mengelompokkan buku."}
            >
              {!loading && !storeError && (search || levelFilter)
                ? <button type="button" onClick={() => { setSearch(""); setLevelFilter(""); }} className="workspace-button">Reset pencarian dan filter</button>
                : !loading && !storeError && !categories.length && <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className="workspace-button workspace-button-primary"><Plus size={16} aria-hidden="true" />Tambah kategori</button>}
            </EmptyPanel>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Kategori"
        description={
          deleteTarget
            ? deleteTarget.used
              ? `Kategori "${deleteTarget.name}" masih digunakan oleh produk, sehingga tidak dapat dihapus. Pindahkan atau hapus produk yang terkait terlebih dahulu.`
              : `Kategori "${deleteTarget.name}" akan dihapus permanen.`
            : ""
        }
        confirmLabel={deleteTarget?.used ? "Mengerti" : "Hapus"}
        cancelLabel={deleteTarget?.used ? undefined : "Batal"}
        destructive={!deleteTarget?.used}
        onConfirm={() => {
          if (deleteTarget && !deleteTarget.used) deleteCategory(deleteTarget.id);
        }}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      />
      <ConfirmDialog
        open={addAllInfo !== null}
        title="Tambah Semua Kelas"
        description={addAllInfo ?? ""}
        confirmLabel="OK"
        cancelLabel={undefined}
        onConfirm={() => undefined}
        onOpenChange={(o) => { if (!o) setAddAllInfo(null); }}
      />
    </div>
  );
}
