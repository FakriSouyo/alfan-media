"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { ProductImageUpload } from "@/components/product-image-upload";
import { ArrowLeft, Plus, Trash2, Save, Banknote, History, TrendingUp } from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { products, categories, movements, orders, updateProduct, adjustStock } = useStore();
  const product = products.find((p) => p.id === id);
  const category = categories.find((c) => c.id === product?.categoryId);
  const productMovements = movements.filter((m) => m.productId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const salesHistory = (() => {
    const rows: { order: typeof orders[0]; item: typeof orders[0]["items"][0] }[] = [];
    for (const o of orders) for (const it of o.items) if (it.productId === id) rows.push({ order: o, item: it });
    rows.sort((a,b)=> b.order.createdAt.localeCompare(a.order.createdAt));
    return rows;
  })();
  const salesStats = (() => {
    let terjual=0, omzet=0, modal=0, laba=0;
    for (const {order, item} of salesHistory.filter(({order})=> order.status!=="CANCELLED")) {
      const discPesanan = order.discount>0 && order.subtotal>0 ? Math.round(order.discount*(item.subtotal/order.subtotal)) : 0;
      const rev = item.subtotal - discPesanan;
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

  if (!product) {
    return (
      <div className="p-4 lg:p-6">
        <p className="text-muted-foreground">Produk tidak ditemukan.</p>
        <Link href="/stock/products" className="mt-2 text-[13px] text-foreground underline">Kembali ke daftar</Link>
      </div>
    );
  }

  const addTier = () => setPrices([...prices, { id: "pp-" + Date.now(), tierName: "", price: 0, isDefault: false }]);
  const updateTier = (i: number, patch: Record<string, unknown>) => setPrices(prices.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const removeTier = (i: number) => { if (prices.length > 1) setPrices(prices.filter((_, idx) => idx !== i)); };
  const setDefault = (i: number) => setPrices(prices.map((p, idx) => ({ ...p, isDefault: idx === i })));

  const handleSave = () => {
    updateProduct(id, { name, categoryId, barcode: barcode.trim(), description, publishedYear, semester, costPrice, imagePath: imagePath || undefined, prices });
    setEditing(false);
  };

  const handleAdjust = () => {
    if (adjQty === 0 || !adjRef.trim()) return;
    adjustStock(id, adjQty, adjRef.trim());
    setAdjQty(0);
    setAdjRef("");
  };

  const inputClass = "h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const movTypeLabel: Record<string, string> = { INITIAL: "Stok Awal", SALE: "Penjualan", ADJUSTMENT: "Penyesuaian", RETURN: "Retur", CANCELLED_ORDER: "Pembatalan" };

  return (
    <div className="p-4 lg:p-6">
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
            <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Edit</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setName(product.name); setCategoryId(product.categoryId); setBarcode(product.barcode); setDescription(product.description); setPublishedYear(product.publishedYear); setSemester(product.semester); setCostPrice(product.costPrice); setImagePath(product.imagePath ?? ""); setPrices(product.prices); }} className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Batal</button>
              <button onClick={handleSave} className="flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"><Save size={14} /> Simpan</button>
            </div>
          )
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Details */}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-foreground">Gambar Sampul</label>
            <ProductImageUpload value={editing ? (imagePath || undefined) : (product.imagePath || undefined)} onChange={setImagePath} />
          </div>
          {editing ? (
            <div className="flex flex-col gap-3">
              <label className="text-[12px] font-medium text-foreground">Nama Produk</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <label className="text-[12px] font-medium text-foreground">Kategori</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full" placeholder="Pilih kategori" />
                <SelectContent>
                  {categories.map((c, i) => (
                    <SelectItem key={c.id} index={i} value={c.id}><CategoryName c={c} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="text-[12px] font-medium text-foreground">Barcode (opsional)</label>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Boleh dikosongkan"
                inputMode="numeric"
                autoComplete="off"
                className={inputClass}
              />
              <label className="text-[12px] font-medium text-foreground">Deskripsi</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] font-medium text-foreground">Tahun</label><input type="number" value={publishedYear} onChange={(e) => setPublishedYear(parseInt(e.target.value) || 0)} className={inputClass} /></div>
                <div><label className="text-[12px] font-medium text-foreground">Semester</label>
                  <Select value={semester} onValueChange={(v) => setSemester(v as "Ganjil" | "Genap")}>
                    <SelectTrigger className="w-full" />
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
                  <input type="number" value={costPrice || ""} onChange={(e) => setCostPrice(parseInt(e.target.value) || 0)} min={0} className={inputClass} />
                </div>
                <div><label className="text-[12px] font-medium text-foreground">Stok</label><input type="number" value={product.stock} readOnly className={inputClass + " opacity-60"} /></div>
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
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-foreground">Harga</h3>
            {editing && (
              <button onClick={addTier} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={12} /> Tier</button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {prices.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                {editing ? (
                  <>
                    <input value={p.tierName} onChange={(e) => updateTier(i, { tierName: e.target.value })} className="h-7 w-24 rounded border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input type="number" value={p.price || ""} onChange={(e) => updateTier(i, { price: parseInt(e.target.value) || 0 })} className="h-7 w-24 rounded border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button onClick={() => setDefault(i)} className={`rounded px-1.5 py-0.5 text-[10px] ${p.isDefault ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>D</button>
                    <button onClick={() => removeTier(i)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
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
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Penyesuaian Stok</h3>
          <div className="flex gap-2">
            <input type="number" value={adjQty || ""} onChange={(e) => setAdjQty(parseInt(e.target.value) || 0)} placeholder="+/- Qty" className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
            <input value={adjRef} onChange={(e) => setAdjRef(e.target.value)} placeholder="Catatan" className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={handleAdjust} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">OK</button>
          </div>
        </div>

        {/* Riwayat Penjualan & Laba — terlihat laba per buku + dropdown riwayat */}
        <div className="rounded-xl border border-border bg-background p-4 lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><History size={14}/> Riwayat Penjualan & Laba</h3>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Terjual</div>
              <div className="text-[14px] font-bold text-foreground">{salesStats.terjual} pcs</div>
              <div className="text-[11px] text-muted-foreground">{salesStats.count} transaksi</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Omzet bersih</div>
              <div className="text-[13px] font-semibold text-foreground">{formatRupiah(salesStats.omzet)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modal terpakai</div>
              <div className="text-[13px] font-medium text-muted-foreground">{formatRupiah(salesStats.modal)}</div>
            </div>
            <div className={`rounded-lg border p-2.5 ${salesStats.laba>=0 ? "border-emerald-500/20 bg-emerald-500/10" : "border-destructive/20 bg-destructive/10"}`}>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70"><TrendingUp size={10}/> Laba total</div>
              <div className={`text-[13px] font-bold ${salesStats.laba>=0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{formatRupiah(salesStats.laba)}</div>
              <div className="text-[11px] opacity-70">{salesStats.omzet>0 ? Math.round(salesStats.laba/salesStats.omzet*100):0}% margin</div>
            </div>
          </div>
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
        <div className="rounded-xl border border-border bg-background p-4 lg:col-span-2">
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
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
