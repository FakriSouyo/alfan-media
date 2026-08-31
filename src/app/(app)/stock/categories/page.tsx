"use client";

import { useState } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { CategoryLevel } from "@/lib/types";

/** Kelas romawi per jenjang: SD I–VI, SMP I–III, SMA I–III. */
const KELAS_BY_JENJANG: Record<CategoryLevel, string[]> = {
  SD: ["I", "II", "III", "IV", "V", "VI"],
  SMP: ["I", "II", "III"],
  SMA: ["I", "II", "III"],
};

const JENJANG_OPTIONS: CategoryLevel[] = ["SD", "SMP", "SMA"];

export default function CategoriesPage() {
  const { categories, products, addCategory, updateCategory, deleteCategory } = useStore();
  const [search, setSearch] = useState("");
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

  const filtered = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      (c.level ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setName(""); setDesc(""); setJenjang(""); setKelas(""); setEditId(null); setShowForm(false); setError("");
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError("Nama kategori wajib diisi"); return; }
    if (editId) {
      updateCategory(editId, name.trim(), desc.trim(), levelValue);
    } else {
      addCategory(name.trim(), desc.trim(), levelValue);
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
    setDeleteTarget({ id, name: c?.name ?? "", used });
  };

  // Buat sekaligus semua kategori kelas SD I–VI, SMP I–III, SMA I–III untuk
  // nama yang sedang diisi (tanpa duplikat dengan yang sudah ada).
  const handleAddAllClasses = () => {
    if (!name.trim()) { setError("Nama kategori wajib diisi untuk menambah semua kelas"); return; }
    const target = name.trim();
    let added = 0;
    for (const j of JENJANG_OPTIONS) {
      for (const k of KELAS_BY_JENJANG[j]) {
        const level = `${j} ${k}`;
        const exists = categories.some((c) => c.name === target && c.level === level);
        if (!exists) {
          addCategory(target, desc.trim(), level);
          added++;
        }
      }
    }
    resetForm();
    setAddAllInfo(
      added > 0
        ? `Berhasil menambah ${added} kategori kelas untuk "${target}" (SD I–VI, SMP I–III, SMA I–III).`
        : `Semua kategori kelas untuk "${target}" sudah ada.`
    );
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Kategori"
        description="Kelola kategori produk buku."
        actions={
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
          >
            <Plus size={14} /> Tambah Kategori
          </button>
        }
      />

      {/* Search */}
      <div className="mt-4">
        <input
          type="text"
          placeholder="Cari kategori..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-foreground">{editId ? "Edit Kategori" : "Tambah Kategori"}</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Nama Kategori *</label>
                <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
                {!error && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Mata pelajaran saja — kelas dipilih di samping. cth: nama "Matematika" + jenjang SMA + kelas I = rak Matematika Kelas X.
                  </p>
                )}
                {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
              </div>

              {/* Jenjang + Kelas terpisah dari nama */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-foreground">Jenjang</label>
                  <Select
                    value={jenjang}
                    onValueChange={(v) => { setJenjang(v as CategoryLevel | ""); setKelas(""); }}
                  >
                    <SelectTrigger placeholder="Pilih jenjang" className="w-full" />
                    <SelectContent>
                      {JENJANG_OPTIONS.map((j, i) => (
                        <SelectItem key={j} index={i} value={j}>{j}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-foreground">Kelas</label>
                  <Select value={kelas} onValueChange={setKelas}>
                    <SelectTrigger placeholder={jenjang ? "Pilih kelas" : "Pilih jenjang dulu"} className="w-full" />
                    <SelectContent>
                      {(jenjang ? KELAS_BY_JENJANG[jenjang] : []).map((k, i) => (
                        <SelectItem key={k} index={i} value={k}>{`Kelas ${k}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Deskripsi</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              {!editId && (
                <button onClick={handleAddAllClasses} className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-[13px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground">
                  + Tambah Semua Kelas <span className="text-[11px] font-normal">(SD I–VI · SMP I–III · SMA I–III)</span>
                </button>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Batal</button>
                <button onClick={handleSubmit} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">
                  {editId ? "Simpan" : "Tambah"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-3 rounded-xl border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Kelas</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Deskripsi</th>
                <th className="px-4 py-2 font-medium text-right">Produk</th>
                <th className="px-4 py-2 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-2">
                    {c.level ? (
                      <span className="inline-block rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground">{c.level}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{c.description || "-"}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{products.filter((p) => p.categoryId === c.id).length}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleEdit(c.id)} className="rounded p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(c.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Tidak ada kategori</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
