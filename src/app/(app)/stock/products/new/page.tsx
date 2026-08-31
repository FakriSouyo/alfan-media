"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";
import { CategoryName } from "@/components/category-label";
import { Plus, Trash2, Tags } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface PriceTier {
  tierName: string;
  price: number;
  isDefault: boolean;
}

export default function NewProductPage() {
  const router = useRouter();
  const { categories, products, addProduct } = useStore();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [publishedYear, setPublishedYear] = useState(new Date().getFullYear());
  const [semester, setSemester] = useState<"Ganjil" | "Genap">("Ganjil");
  const [stock, setStock] = useState(0);
  const [prices, setPrices] = useState<PriceTier[]>([
    { tierName: "Normal", price: 0, isDefault: true },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addTier = () => {
    setPrices([...prices, { tierName: "", price: 0, isDefault: false }]);
  };

  const updateTier = (i: number, patch: Partial<PriceTier>) => {
    setPrices(prices.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const removeTier = (i: number) => {
    if (prices.length <= 1) return;
    const removed = prices[i];
    const next = prices.filter((_, idx) => idx !== i);
    if (removed.isDefault && next.length > 0) next[0].isDefault = true;
    setPrices(next);
  };

  const setDefault = (i: number) => {
    setPrices(prices.map((p, idx) => ({ ...p, isDefault: idx === i })));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nama produk wajib diisi";
    else {
      // Nama harus MEMBEDAKAN buku di rak yang sama — bukan ulangan kategori.
      const cat = categories.find((c) => c.id === categoryId);
      if (cat) {
        const n = name.trim().toLowerCase();
        const sameAsCat =
          n === cat.name.toLowerCase() ||
          n === `${cat.name} ${cat.level ?? ""}`.trim().toLowerCase();
        if (sameAsCat) {
          e.name = "Nama terlalu umum (hanya mengulang kategori). Tambahkan penerbit/kurikulum/edisi, mis: 'Matematika SMA Kelas X — Kurikulum Merdeka (Erlangga)'.";
        }
      }
    }
    if (!categoryId) e.categoryId = "Kategori wajib dipilih";
    if (!barcode.trim()) e.barcode = "Barcode wajib diisi";
    else if (products.some((p) => p.barcode === barcode.trim())) e.barcode = "Barcode sudah digunakan";
    if (!description.trim()) e.description = "Deskripsi wajib diisi";
    if (publishedYear < 1900 || publishedYear > new Date().getFullYear() + 1) e.publishedYear = "Tahun tidak valid";
    if (stock < 0) e.stock = "Stok tidak boleh negatif";
    if (prices.length === 0 || prices.every((p) => p.price <= 0)) e.prices = "Minimal satu harga harus diisi";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    addProduct({
      name: name.trim(),
      categoryId,
      barcode: barcode.trim(),
      description: description.trim(),
      publishedYear,
      semester,
      stock,
      prices: prices.map((p, i) => ({ id: "pp-new-" + i, ...p })),
    });
    router.push("/stock/products");
  };

  const inputClass = "h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Tambah Produk" description="Isi data produk baru." />

      <div className="mt-4 max-w-5xl rounded-xl border border-border bg-background p-4 lg:p-5">
        <h3 className="mb-4 text-[14px] font-semibold text-foreground">Informasi Produk</h3>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Nama Produk *"
              error={errors.name}
              hint="Judul lengkap yang membedakan buku di rak yang sama — sertakan penerbit/kurikulum/edisi bila perlu. cth: 'Matematika SMA Kelas X Semester 1 — Kurikulum Merdeka (Erlangga)'."
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cth: Matematika SMA Kelas X Semester 1 — Kurikulum Merdeka (Erlangga)"
                className={inputClass}
              />
            </Field>

            <Field label="Barcode Produk *" error={errors.barcode}>
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label="Kategori Produk *"
              error={errors.categoryId}
              hint="Rak buku = mapel + kelas. cth: Matematika [SMA I] = Matematika Kelas X. Jika belum ada, buat dulu di menu Kategori."
            >
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger icon={Tags} placeholder="Pilih kategori" className="w-full" error={errors.categoryId} />
                <SelectContent>
                  {categories.map((c, i) => (
                    <SelectItem key={c.id} index={i} value={c.id}><CategoryName c={c} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Semester Buku *">
              <Select value={semester} onValueChange={(v) => setSemester(v as "Ganjil" | "Genap")}>
                <SelectTrigger className="w-full" />
                <SelectContent>
                  <SelectItem index={0} value="Ganjil">Ganjil</SelectItem>
                  <SelectItem index={1} value="Genap">Genap</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tahun Terbit *" error={errors.publishedYear}>
              <input type="number" value={publishedYear} onChange={(e) => setPublishedYear(parseInt(e.target.value) || 0)} className={inputClass} />
            </Field>
          </div>

          <Field label="Stok *" error={errors.stock}>
            <input type="number" value={stock} onChange={(e) => setStock(parseInt(e.target.value) || 0)} min={0} className={inputClass} />
          </Field>

          <Field label="Deskripsi / Keterangan Buku *" error={errors.description}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
          </Field>

          {/* Price Tiers */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[12px] font-medium text-foreground">Harga Produk</label>
              <button onClick={addTier} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                <Plus size={12} /> Tambah Tier
              </button>
            </div>
            {errors.prices && <p className="mb-1 text-[11px] text-destructive">{errors.prices}</p>}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {prices.map((tier, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
                  <input
                    value={tier.tierName}
                    onChange={(e) => updateTier(i, { tierName: e.target.value })}
                    placeholder="Nama tier"
                    className="h-8 flex-1 min-w-[80px] rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    type="number"
                    value={tier.price || ""}
                    onChange={(e) => updateTier(i, { price: parseInt(e.target.value) || 0 })}
                    placeholder="Harga"
                    className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => setDefault(i)}
                    className={`rounded-lg px-2 py-1 text-[11px] ${tier.isDefault ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {tier.isDefault ? "Default" : "Set Default"}
                  </button>
                  {prices.length > 1 && (
                    <button onClick={() => removeTier(i)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => router.back()} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Batal</button>
            <button onClick={handleSubmit} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">Simpan Produk</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-foreground">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
