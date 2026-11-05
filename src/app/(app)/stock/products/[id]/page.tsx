import { useParams } from "@/lib/navigation";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "@/lib/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { businessDate } from "@/lib/business-date";
import { allocateOrderItemNet, isRecognizedSale } from "@/lib/sales-report";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { Metrics } from "@/components/workspace";
import { ProductImageUpload, productImageUrl } from "@/components/product-image-upload";
import { ArrowLeft, Plus, Trash2, Save, Banknote, History, ImageIcon } from "lucide-react";
import { Link } from "@/lib/navigation";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function ProductDetailPage() {
  const { id } = useParams();
  const { products, categories, movements, orders, loading, updateProduct, adjustStock } = useStore();
  const searchParams = useSearchParams();
  const product = products.find((p) => p.id === id);
  const category = categories.find((c) => c.id === product?.categoryId);
  const productMovements = movements.filter((m) => m.productId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const salesHistory = (() => {
    const rows: { order: typeof orders[0]; item: typeof orders[0]["items"][0]; allocatedNet: number }[] = [];
    for (const o of orders) {
      if (!isRecognizedSale(o.status)) continue;
      const net = allocateOrderItemNet(o);
      o.items.forEach((it, index) => { if (it.productId === id) rows.push({ order: o, item: it, allocatedNet: net[index] ?? 0 }); });
    }
    rows.sort((a,b)=> b.order.createdAt.localeCompare(a.order.createdAt));
    return rows;
  })();
  const salesStats = (() => {
    let terjual=0, omzet=0, modal=0, laba=0;
    for (const {item, allocatedNet} of salesHistory) {
      const rev = allocatedNet;
      const c = (item.costPrice ?? product?.costPrice ?? 0)*item.quantity;
      terjual+=item.quantity; omzet+=rev; modal+=c; laba+=rev-c;
    }
    return { terjual, omzet, modal, laba, count: salesHistory.length };
  })();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [publishedYear, setPublishedYear] = useState(product?.publishedYear ?? new Date().getFullYear());
  const [semester, setSemester] = useState<"Ganjil" | "Genap">(product?.semester ?? "Ganjil");
  const [costPrice, setCostPrice] = useState(product?.costPrice ?? 0);
  const [imagePath, setImagePath] = useState(product?.imagePath ?? "");
  const [prices, setPrices] = useState(product?.prices ?? []);
  const [adjQty, setAdjQty] = useState(0);
  const [adjRef, setAdjRef] = useState("");
  const [saveError, setSaveError] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [saving, setSaving] = useState(false);
  const initializedProductId = useRef("");

  useEffect(() => {
    if (!product || initializedProductId.current === id) return;
    initializedProductId.current = id;
    setName(product.name);
    setCategoryId(product.categoryId);
    setBarcode(product.barcode);
    setDescription(product.description);
    setPublishedYear(product.publishedYear);
    setSemester(product.semester);
    setCostPrice(product.costPrice);
    setImagePath(product.imagePath ?? "");
    setPrices(product.prices);
    setEditing(searchParams.get("edit") === "1");
  }, [id, product, searchParams]);

  if (!product && loading) {
    return <div role="status" className="flex min-h-64 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" />Memuat produk…</div>;
  }
  if (!product) {
    return (
      <div className="workspace-page">
        <p className="text-muted-foreground">Produk tidak ditemukan.</p>
        <Link href="/stock/products" className="mt-2 text-[13px] text-foreground underline">Kembali ke daftar</Link>
      </div>
    );
  }

  const addTier = () => setPrices([...prices, { id: "pp-" + Date.now(), tierName: "", price: 0, isDefault: false }]);
  const updateTier = (i: number, patch: Record<string, unknown>) => setPrices(prices.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const removeTier = (i: number) => { if (prices.length > 1) setPrices(prices.filter((_, idx) => idx !== i)); };
  const setDefault = (i: number) => setPrices(prices.map((p, idx) => ({ ...p, isDefault: idx === i })));

  const handleSave = async () => {
    setSaveError("");
    if (!name.trim()) { setSaveError("Nama produk wajib diisi."); return; }
    const cleanBarcode = barcode.trim();
    if (cleanBarcode && products.some((other) => other.id !== id && other.barcode.trim().toLocaleLowerCase("id-ID") === cleanBarcode.toLocaleLowerCase("id-ID"))) {
      setSaveError("Barcode sudah digunakan produk lain."); return;
    }
    const currentYear = Number(businessDate().slice(0, 4));
    if (!Number.isInteger(publishedYear) || publishedYear < 1900 || publishedYear > currentYear + 1) { setSaveError("Tahun terbit tidak valid."); return; }
    if (!Number.isInteger(costPrice) || costPrice < 0) { setSaveError("Harga awal tidak boleh negatif."); return; }
    const tierNames = prices.map((price) => price.tierName.trim().toLocaleLowerCase("id-ID"));
    if (prices.length === 0 || prices.some((price) => !price.tierName.trim()) || new Set(tierNames).size !== tierNames.length) { setSaveError("Setiap tier harga harus memiliki nama unik."); return; }
    if (prices.some((price) => !Number.isInteger(price.price) || price.price < 0)) { setSaveError("Harga tier harus berupa angka bulat nol atau lebih."); return; }
    if (prices.filter((price) => price.isDefault).length !== 1) { setSaveError("Pilih tepat satu tier sebagai harga default."); return; }
    setSaving(true);
    const saved = await updateProduct(id, { name: name.trim(), categoryId, barcode: cleanBarcode, description, publishedYear, semester, costPrice, imagePath: imagePath || undefined, prices });
    setSaving(false);
    if (!saved) { setSaveError("Produk gagal disimpan. Periksa barcode dan koneksi database."); return; }
    setEditing(false);
  };

  const handleAdjust = async () => {
    setAdjustError("");
    if (!Number.isInteger(adjQty) || adjQty === 0) { setAdjustError("Jumlah penyesuaian harus berupa bilangan bulat selain nol."); return; }
    if (!adjRef.trim()) { setAdjustError("Catatan wajib diisi."); return; }
    const saved = await adjustStock(id, adjQty, adjRef.trim());
    if (!saved) { setAdjustError("Penyesuaian gagal disimpan. Coba lagi."); return; }
    setAdjQty(0);
    setAdjRef("");
  };

  const inputClass = "h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const movTypeLabel: Record<string, string> = { INITIAL: "Stok Awal", SALE: "Penjualan", ADJUSTMENT: "Penyesuaian", RETURN: "Retur", CANCELLED_ORDER: "Pembatalan" };

  return (
    <div className="workspace-page">
      <div className="mb-4">
        <Link href="/stock/products" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader
        title={product.name}
        description={`${product.barcode ? `Barcode: ${product.barcode} · ` : "Tanpa barcode · "}${categoryText(category)} · ${product.semester}`}
        actions={
          !editing ? (
            <button onClick={() => setEditing(true)} className="workspace-button">Edit</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setName(product.name); setCategoryId(product.categoryId); setBarcode(product.barcode); setDescription(product.description); setPublishedYear(product.publishedYear); setSemester(product.semester); setCostPrice(product.costPrice); setImagePath(product.imagePath ?? ""); setPrices(product.prices); }} className="workspace-button">Batal</button>
              <button onClick={handleSave} disabled={saving} className="workspace-button workspace-button-primary"><Save size={14} /> {saving ? "Menyimpan…" : "Simpan"}</button>
            </div>
          )
        }
      />

      <div className="product-detail-layout">
        {/* Details */}
        <div className="workspace-panel product-information p-5">
          <h2 className="mb-5 font-serif text-2xl">Informasi buku</h2>
          <div className="mb-6">
            {editing ? <ProductImageUpload value={imagePath||undefined} onChange={setImagePath} /> : <div className="flex flex-wrap items-start gap-5"><div className="flex h-48 w-36 shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-3">{product.imagePath ? <img src={productImageUrl(product.imagePath)??undefined} alt={"Sampul "+product.name} className="h-full w-full object-contain" /> : <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto mb-2" size={28} /><span className="text-xs">Belum ada sampul</span></div>}</div><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Harga utama</p><p className="mt-2 font-serif text-3xl">{formatRupiah(product.prices.find(p=>p.isDefault)?.price??0)}</p><p className="mt-4 text-xs text-muted-foreground">{product.stock} buku tersedia</p></div></div>}
          </div>
          {editing ? (
            <div className="flex flex-col gap-3">
              {saveError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{saveError}</p>}
              <label className="text-[12px] font-medium text-foreground">Nama Produk</label>
              <input aria-label="Nama produk" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <label className="text-[12px] font-medium text-foreground">Kategori</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger aria-label="Kategori produk" className="w-full" placeholder="Pilih kategori" />
                <SelectContent>
                  {categories.map((c, i) => (
                    <SelectItem key={c.id} index={i} value={c.id}><CategoryName c={c} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="text-[12px] font-medium text-foreground">Barcode (opsional)</label>
              <input
                aria-label="Barcode produk"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Boleh dikosongkan"
                inputMode="numeric"
                autoComplete="off"
                className={inputClass}
              />
              <label className="text-[12px] font-medium text-foreground">Deskripsi</label>
              <textarea aria-label="Deskripsi produk" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] font-medium text-foreground">Tahun</label><input aria-label="Tahun terbit" type="number" value={publishedYear} onChange={(e) => setPublishedYear(parseInt(e.target.value) || 0)} className={inputClass} /></div>
                <div><label className="text-[12px] font-medium text-foreground">Semester</label>
                  <Select value={semester} onValueChange={(v) => setSemester(v as "Ganjil" | "Genap")}>
                    <SelectTrigger aria-label="Semester" className="w-full" />
                    <SelectContent>
                      <SelectItem index={0} value="Ganjil">Ganjil</SelectItem>
                      <SelectItem index={1} value="Genap">Genap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1 text-[12px] font-medium text-foreground"><Banknote size={12} /> Harga Awal (Modal)</label>
                  <input aria-label="Modal per buku" type="number" value={costPrice || ""} onChange={(e) => setCostPrice(parseInt(e.target.value) || 0)} min={0} className={inputClass} />
                </div>
                <div><label className="text-[12px] font-medium text-foreground">Stok</label><input aria-label="Stok saat ini" type="number" value={product.stock} readOnly className={inputClass + " opacity-60"} /></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-[13px]">
              <Row label="Deskripsi" value={product.description} />
              <Row label="Tahun Terbit" value={String(product.publishedYear)} />
              <Row label="Semester" value={product.semester} />
              <Row label="Stok Saat Ini" value={String(product.stock)} />
              <Row label="Harga Awal (Modal)" value={formatRupiah(product.costPrice ?? 0)} />
              {(() => {
                const sell = product.prices.find((p) => p.isDefault)?.price ?? 0;
                const cost = product.costPrice ?? 0;
                if (sell <= 0) return null;
                const margin = sell - cost;
                const pct = sell > 0 ? Math.round((margin / sell) * 1000) / 10 : 0;
                return (
                  <Row
                    label="Laba per Unit"
                    value={`${formatRupiah(margin)} (${pct}%)`}
                  />
                );
              })()}
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="workspace-panel product-pricing p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-foreground">Harga</h3>
            {editing && (
              <button onClick={addTier} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={12} /> Tier</button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {prices.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                {editing ? (
                  <>
                    <input aria-label={"Nama harga " + (i+1)} value={p.tierName} onChange={(e) => updateTier(i, { tierName: e.target.value })} className="h-7 w-24 rounded border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input aria-label={"Nilai harga " + (i+1)} type="number" value={p.price || ""} onChange={(e) => updateTier(i, { price: parseInt(e.target.value) || 0 })} className="h-7 w-24 rounded border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button aria-label={"Jadikan harga utama " + p.tierName} aria-pressed={p.isDefault} onClick={() => setDefault(i)} className={`rounded px-1.5 py-0.5 text-[10px] ${p.isDefault ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>Utama</button>
                    <button aria-label={"Hapus harga " + p.tierName} onClick={() => removeTier(i)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
                  </>
                ) : (
                  <div className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-foreground/[0.03]">
                    <span className="text-[13px] text-foreground">{p.tierName}{p.isDefault ? " ★" : ""}</span>
                    <span className="text-[13px] font-medium text-foreground">{formatRupiah(p.price)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stock Adjustment */}
        <div className="workspace-panel product-adjustment p-5">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Penyesuaian Stok</h3>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Gunakan angka positif untuk menambah dan negatif untuk mengurangi stok. Sertakan alasan perubahan.</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Jumlah penyesuaian stok" type="number" value={adjQty || ""} onChange={(e) => setAdjQty(parseInt(e.target.value) || 0)} placeholder="+/- Qty" className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
            <input aria-label="Catatan penyesuaian" value={adjRef} onChange={(e) => setAdjRef(e.target.value)} placeholder="Catatan" className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={handleAdjust} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">Terapkan</button>
          </div>
          {adjustError && <p role="alert" className="mt-2 text-[12px] text-destructive">{adjustError}</p>}
        </div>

        {/* Riwayat Penjualan & Laba — terlihat laba per buku + dropdown riwayat */}
        <div className="workspace-panel p-5 md:col-span-2">
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><History size={14}/> Riwayat Penjualan & Laba</h3>
          <Metrics items={[{label:"Buku terjual",value:salesStats.terjual},{label:"Omzet bersih",value:formatRupiah(salesStats.omzet)},{label:"Modal terpakai",value:formatRupiah(salesStats.modal)},{label:"Laba penjualan",value:formatRupiah(salesStats.laba),tone:"accent"}]} />
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                  <th className="px-2.5 py-1.5 font-medium">Tanggal / Invoice</th>
                  <th className="px-2.5 py-1.5 font-medium hidden sm:table-cell">Pelanggan</th>
                  <th className="px-2.5 py-1.5 font-medium text-right">Qty</th>
                  <th className="px-2.5 py-1.5 font-medium text-right">Harga</th>
                  <th className="px-2.5 py-1.5 font-medium text-right hidden sm:table-cell">Modal</th>
                  <th className="px-2.5 py-1.5 font-medium text-right">Laba</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.slice(0,20).map(({order,item})=>{
                  const discPesanan = order.discount>0 && order.subtotal>0 ? Math.round(order.discount*(item.subtotal/order.subtotal)) : 0;
                  const revenue = item.subtotal - discPesanan;
                  const cost = (item.costPrice ?? product.costPrice ?? 0)*item.quantity;
                  const laba = revenue - cost;
                  return (
                    <tr key={order.id+item.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                      <td className="px-2.5 py-1.5">
                        <div className="font-medium text-foreground">{order.id}</div>
                        <div className="text-[11px] text-muted-foreground">{order.date} · <span className={`rounded px-1 py-0.5 text-[10px] ${order.status==="COMPLETED"?"bg-emerald-500/15 text-emerald-600": order.status==="CANCELLED"?"bg-destructive/15 text-destructive":"bg-foreground/10 text-foreground"}`}>{order.status}</span></div>
                      </td>
                      <td className="px-2.5 py-1.5 hidden sm:table-cell text-muted-foreground truncate max-w-[110px]">{order.customerName}</td>
                      <td className="px-2.5 py-1.5 text-right font-medium text-foreground">×{item.quantity}</td>
                      <td className="px-2.5 py-1.5 text-right">
                        <div className="font-medium text-foreground">{formatRupiah(item.unitPrice)}</div>
                        {item.discountPercent>0 && <div className="text-destructive text-[11px]">−{item.discountPercent}%</div>}
                        {discPesanan>0 && <div className="text-amber-600 text-[10px]">−{formatRupiah(discPesanan)}</div>}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground hidden sm:table-cell">{formatRupiah(cost)}</td>
                      <td className={`px-2.5 py-1.5 text-right font-semibold ${laba>=0?"text-emerald-600 dark:text-emerald-400":"text-destructive"}`}>{formatRupiah(laba)}</td>
                    </tr>
                  );
                })}
                {salesHistory.length===0 && <tr><td colSpan={6} className="px-2.5 py-6 text-center text-muted-foreground">Belum pernah terjual — laba akan muncul setelah ada transaksi</td></tr>}
              </tbody>
            </table>
          </div>
          {salesHistory.length>20 && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Menampilkan 20 terbaru dari {salesHistory.length} transaksi</p>}
        </div>

        {/* Stock Movements */}
        <div className="workspace-panel p-5 md:col-span-2">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Riwayat Stok</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium hidden md:table-cell">Tanggal</th>
                  <th className="px-2 py-1.5 font-medium">Tipe</th>
                  <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                  <th className="px-2 py-1.5 font-medium">Referensi</th>
                </tr>
              </thead>
              <tbody>
                {productMovements.slice(0, 20).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-1.5 text-muted-foreground hidden md:table-cell">{m.createdAt.slice(0, 10)}</td>
                    <td className="px-2 py-1.5 text-foreground">
                      {movTypeLabel[m.type]}
                      <span className="block text-[11px] text-muted-foreground md:hidden">{m.createdAt.slice(0, 10)}</span>
                    </td>
                    <td className={`px-2 py-1.5 text-right font-medium ${m.quantity > 0 ? "text-emerald-500" : "text-destructive"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      <span className="block max-w-[140px] truncate md:max-w-none" title={m.reference}>{m.reference}</span>
                    </td>
                  </tr>
                ))}
                {productMovements.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">Belum ada riwayat</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 border-b border-border py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      <span className="whitespace-pre-wrap break-words font-medium leading-relaxed text-foreground">{value || "Belum diisi"}</span>
    </div>
  );
}
