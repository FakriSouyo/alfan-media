
import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";
import { CategoryName } from "@/components/category-label";
import { ProductImageUpload } from "@/components/product-image-upload";
import { Link } from "@/lib/navigation";
import { formatRupiah } from "@/lib/currency";
import { Plus, Trash2, Tags, ArrowLeft, Save } from "lucide-react";
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
  const [costPrice, setCostPrice] = useState(0);
  const [imagePath, setImagePath] = useState("");
  const [prices, setPrices] = useState<PriceTier[]>([
    { tierName: "Normal", price: 0, isDefault: true },
  ]);
  const [saving,setSaving] = useState(false);
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
    if (barcode.trim() && products.some((p) => p.barcode === barcode.trim())) e.barcode = "Barcode sudah digunakan";
    if (!description.trim()) e.description = "Deskripsi wajib diisi";
    if (publishedYear < 1900 || publishedYear > new Date().getFullYear() + 1) e.publishedYear = "Tahun tidak valid";
    if (stock < 0) e.stock = "Stok tidak boleh negatif";
    if (costPrice < 0) e.costPrice = "Harga awal tidak boleh negatif";
    if (prices.length === 0 || prices.every((p) => p.price <= 0)) e.prices = "Minimal satu harga harus diisi";
    else {
      // Jual di bawah modal tidak masuk akal — beri peringatan jelas.
      const sell = prices.find((p) => p.isDefault)?.price ?? prices[0]?.price ?? 0;
      if (costPrice > 0 && sell > 0 && sell < costPrice) {
        e.prices = "Harga jual default lebih rendah dari harga awal — cek lagi (akan rugi).";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const saved = await addProduct({
      name: name.trim(),
      categoryId,
      barcode: barcode.trim(),
      description: description.trim(),
      publishedYear,
      semester,
      stock,
      costPrice,
      imagePath: imagePath || undefined,
      prices: prices.map((p, i) => ({ id: "pp-new-" + i, ...p })),
    });
    setSaving(false);
    if (!saved) { setErrors({save:"Produk belum berhasil disimpan. Periksa koneksi lalu coba lagi."}); return; }
    router.push("/stock/products");
  };

  const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const defaultPrice = prices.find(p=>p.isDefault)?.price ?? 0;
  return <div className="workspace-page">
    <Link href="/stock/products" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={15} />Kembali ke katalog</Link>
    <PageHeader title="Tambah buku" description="Lengkapi identitas, persediaan, dan harga buku. Tanda * wajib diisi." />
    <div className="form-workspace">
      <div className="workspace-panel">
        <section className="form-section">
          <h2 className="form-section-title"><span>01</span>Identitas buku</h2>
          <div className="grid gap-5">
            <Field id="product-name" label="Nama buku *" error={errors.name} hint="Sertakan kelas, penerbit, atau edisi agar buku mudah dibedakan."><input id="product-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Matematika Kelas X — Kurikulum Merdeka" className={inputClass} aria-invalid={!!errors.name} aria-describedby={errors.name ? "product-name-error" : undefined} /></Field>
            <div className="grid gap-5 sm:grid-cols-2"><Field id="product-category" label="Kategori *" error={errors.categoryId}><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger id="product-category" aria-label="Kategori buku" icon={Tags} placeholder="Pilih kategori" className="w-full" error={errors.categoryId} /><SelectContent>{categories.map((c,i)=><SelectItem key={c.id} index={i} value={c.id}><CategoryName c={c} /></SelectItem>)}</SelectContent></Select></Field><Field id="product-barcode" label="Barcode" error={errors.barcode} hint="Opsional, jika buku memiliki barcode."><input id="product-barcode" value={barcode} onChange={e=>setBarcode(e.target.value)} autoComplete="off" placeholder="Nomor barcode" className={inputClass} /></Field></div>
            <div className="grid grid-cols-2 gap-5"><Field id="product-year" label="Tahun terbit *" error={errors.publishedYear}><input id="product-year" type="number" value={publishedYear} onChange={e=>setPublishedYear(parseInt(e.target.value)||0)} className={inputClass} /></Field><Field id="product-semester" label="Semester *"><Select value={semester} onValueChange={v=>setSemester(v as "Ganjil"|"Genap")}><SelectTrigger id="product-semester" aria-label="Semester buku" className="w-full" /><SelectContent><SelectItem index={0} value="Ganjil">Ganjil</SelectItem><SelectItem index={1} value="Genap">Genap</SelectItem></SelectContent></Select></Field></div>
            <Field id="product-description" label="Deskripsi buku *" error={errors.description}><textarea id="product-description" value={description} onChange={e=>setDescription(e.target.value)} rows={4} placeholder="Kurikulum, penerbit, materi, atau catatan lainnya…" className={inputClass} /></Field>
          </div>
        </section>
        <section className="form-section"><h2 className="form-section-title"><span>02</span>Persediaan & modal</h2><div className="grid gap-5 sm:grid-cols-2"><Field id="product-stock" label="Stok awal *" error={errors.stock} hint="Jumlah buku yang tersedia saat ini."><input id="product-stock" type="number" min={0} value={stock} onChange={e=>setStock(parseInt(e.target.value)||0)} className={inputClass} /></Field><Field id="product-cost" label="Modal per buku (Rp) *" error={errors.costPrice} hint="Biaya pembelian satu buku."><input id="product-cost" type="number" min={0} value={costPrice||""} onChange={e=>setCostPrice(parseInt(e.target.value)||0)} placeholder="0" className={inputClass} /></Field></div></section>
        <section className="form-section"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="form-section-title !mb-0"><span>03</span>Harga jual</h2><button type="button" onClick={addTier} className="workspace-button"><Plus size={15} />Tambah harga</button></div><p className="my-3 text-xs leading-relaxed text-muted-foreground">Gunakan beberapa harga untuk eceran, grosir, atau pelanggan khusus. Pilih satu harga utama.</p>
          {errors.prices && <p role="alert" className="mb-3 text-xs text-destructive">{errors.prices}</p>}
          <div className="divide-y divide-border">{prices.map((tier,i)=><div key={i} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field id={"tier-name-"+i} label="Nama harga"><input id={"tier-name-"+i} value={tier.tierName} onChange={e=>updateTier(i,{tierName:e.target.value})} placeholder="Contoh: Grosir" className={inputClass} /></Field>
            <Field id={"tier-price-"+i} label="Harga (Rp)"><input id={"tier-price-"+i} type="number" min={0} value={tier.price||""} onChange={e=>updateTier(i,{price:parseInt(e.target.value)||0})} placeholder="0" className={inputClass} /></Field>
            <div className="flex items-end gap-1"><button type="button" onClick={()=>setDefault(i)} aria-pressed={tier.isDefault} className={"workspace-button "+(tier.isDefault?"bg-accent text-primary":"")}>{tier.isDefault?"Harga utama":"Jadikan utama"}</button>{prices.length>1 && <button type="button" aria-label={"Hapus harga "+(tier.tierName||i+1)} onClick={()=>removeTier(i)} className="workspace-icon hover:text-destructive"><Trash2 size={16} /></button>}</div>
          </div>)}</div>
        </section>
        {errors.save && <p role="alert" className="px-5 pb-4 text-sm text-destructive">{errors.save}</p>}
        <div className="form-actions"><button onClick={()=>router.push("/stock/products")} className="workspace-button">Batal</button><button onClick={()=>void handleSubmit()} disabled={saving} className="workspace-button workspace-button-primary"><Save size={16} />{saving?"Menyimpan…":"Simpan buku"}</button></div>
      </div>
      <aside className="form-aside space-y-5"><section className="workspace-panel p-5"><h2 className="mb-4 text-sm font-semibold">Sampul buku</h2><div className="book-cover-upload"><ProductImageUpload value={imagePath||undefined} onChange={setImagePath} /></div></section><section className="border-l-2 border-primary pl-4"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ringkasan harga</p><p className="mt-2 font-serif text-2xl">{formatRupiah(defaultPrice)}</p><p className="mt-2 text-xs text-muted-foreground">Laba per buku <span className={defaultPrice-costPrice<0?"text-destructive":"text-primary"}>{formatRupiah(defaultPrice-costPrice)}</span></p></section></aside>
    </div>
  </div>;
}

function Field({id,label,error,hint,children}:{id:string;label:string;error?:string;hint?:string;children:React.ReactNode}) {
  return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-xs font-medium">{label}</label>{children}{error?<p id={id+"-error"} role="alert" className="mt-2 text-xs leading-relaxed text-destructive">{error}</p>:hint?<p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>:null}</div>;
}
