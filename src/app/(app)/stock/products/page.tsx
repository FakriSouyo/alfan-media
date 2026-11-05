
import { useMemo, useState } from "react";
import { Link } from "@/lib/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { productImageUrl } from "@/components/product-image-upload";
import { Plus, Pencil, Trash2, PackagePlus, Search, ImageIcon, ChevronDown, ChevronUp, History } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { allocateOrderItemNet, isRecognizedSale } from "@/lib/sales-report";
import { Metrics, PanelHeading, SearchField, EmptyPanel } from "@/components/workspace";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const { products, categories, orders, deleteProduct, adjustStock } = useStore();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  // "Tambah Stok" dialog — add quantity to an existing product.
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockQty, setStockQty] = useState(1);
  const [stockRef, setStockRef] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [stockError, setStockError] = useState("");

  // Dialog konfirmasi hapus produk.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filteredForPick = useMemo(() => productSearch
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.barcode.includes(productSearch)
      )
    : products, [products, productSearch]);

  const filtered = useMemo(() => products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search);
    const matchCat = catFilter === "all" || p.categoryId === catFilter;
    return matchSearch && matchCat && (stockFilter === "all" || (stockFilter === "low" ? p.stock > 0 && p.stock <= 5 : p.stock <= 0));
  }), [products, search, catFilter, stockFilter]);

  const getCat = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? categoryText(c) : "-";
  };
  const getDefaultPrice = (p: typeof products[0]) => p.prices.find((pr) => pr.isDefault)?.price ?? 0;
  const getLabaPerPcs = (p: typeof products[0]) => getDefaultPrice(p) - (p.costPrice ?? 0);

  // Index history and financial stats in one pass, instead of rescanning every
  // order for every row in the product table.
  const { historyByProduct, salesStatsByProduct } = useMemo(() => {
    const history = new Map<string, { order: typeof orders[number]; item: typeof orders[number]["items"][number]; allocatedNet: number }[]>();
    const stats = new Map<string, { terjual: number; omzet: number; modal: number; laba: number; orderIds: Set<string> }>();
    for (const o of orders) {
      if (!isRecognizedSale(o.status)) continue;
      const nets = allocateOrderItemNet(o);
      for (const [index, it] of o.items.entries()) {
        if (!it.productId) continue;
        const rows = history.get(it.productId) ?? [];
        rows.push({ order: o, item: it, allocatedNet: nets[index] ?? 0 });
        history.set(it.productId, rows);
        const value = stats.get(it.productId) ?? { terjual: 0, omzet: 0, modal: 0, laba: 0, orderIds: new Set<string>() };
        const cost = (it.costPrice ?? 0) * it.quantity;
        value.terjual += it.quantity;
        value.omzet += nets[index] ?? 0;
        value.modal += cost;
        value.laba += (nets[index] ?? 0) - cost;
        value.orderIds.add(o.id);
        stats.set(it.productId, value);
      }
    }
    for (const rows of history.values()) rows.sort((a, b) => b.order.date.localeCompare(a.order.date) || b.order.createdAt.localeCompare(a.order.createdAt));
    return { historyByProduct: history, salesStatsByProduct: stats };
  }, [orders]);
  const getSalesHistory = (productId: string) => historyByProduct.get(productId) ?? [];
  const getSoldStats = (productId: string) => {
    const stat = salesStatsByProduct.get(productId);
    return stat ? { terjual: stat.terjual, omzet: stat.omzet, modal: stat.modal, laba: stat.laba, count: stat.orderIds.size } : { terjual: 0, omzet: 0, modal: 0, laba: 0, count: 0 };
  };

  const resetStockForm = () => {
    setSelectedProductId("");
    setStockQty(1);
    setStockRef("");
    setProductSearch("");
    setStockError("");
  };

  const handleAddStock = () => {
    if (!selectedProductId) {
      setStockError("Pilih produk terlebih dahulu");
      return;
    }
    if (!stockQty || stockQty <= 0) {
      setStockError("Jumlah harus lebih dari 0");
      return;
    }
    adjustStock(selectedProductId, stockQty, stockRef.trim() || "Penambahan stok");
    setAddStockOpen(false);
    resetStockForm();
  };

  return (
    <div className="workspace-page">
      <PageHeader
        title="Produk"
        description="Rak buku, harga, dan ketersediaan dalam satu tempat."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={addStockOpen} onOpenChange={(o) => { setAddStockOpen(o); if (!o) resetStockForm(); }}>
              <DialogTrigger asChild>
                <button className="workspace-button">
                  <PackagePlus size={14} /> Tambah Stok
                </button>
              </DialogTrigger>
              <DialogContent size="sm">
                <DialogHeader>
                  <DialogTitle>Tambah Stok Produk</DialogTitle>
                  <DialogDescription>
                    Tambah kuantitas ke stok produk yang sudah ada.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                  {/* Product picker with search */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-foreground">Produk <span className="text-destructive">*</span></label>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Cari produk..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="mb-1.5 h-8 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <Select value={selectedProductId} onValueChange={(v) => { setSelectedProductId(v); setStockError(""); }}>
                      <SelectTrigger placeholder="Pilih produk" className="w-full" />
                      <SelectContent>
                        {filteredForPick.map((pr, i) => (
                          <SelectItem key={pr.id} index={i} value={pr.id}>
                            {pr.name} (stok: {pr.stock})
                          </SelectItem>
                        ))}
                        {filteredForPick.length === 0 && (
                          <div className="px-3 py-2 text-[12px] text-muted-foreground">Tidak ada produk cocok</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-foreground">Jumlah <span className="text-destructive">*</span></label>
                    <input
                      type="number"
                      value={stockQty || ""}
                      onChange={(e) => { setStockQty(parseInt(e.target.value) || 0); setStockError(""); }}
                      min={1}
                      placeholder="0"
                      className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {/* Reference */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-foreground">Catatan</label>
                    <input
                      type="text"
                      value={stockRef}
                      onChange={(e) => setStockRef(e.target.value)}
                      placeholder="cth: Pembelian baru, retur..."
                      className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {stockError && (
                    <p className="text-[12px] text-destructive">{stockError}</p>
                  )}
                </div>

                <DialogFooter className="mt-4 gap-2">
                  <DialogClose asChild>
                    <button className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
                      Batal
                    </button>
                  </DialogClose>
                  <button
                    onClick={handleAddStock}
                    className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
                  >
                    Tambah Stok
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Link
              href="/stock/products/new"
              className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={14} /> Tambah Produk
            </Link>
          </div>
        }
      />

      <Metrics items={[
        { label: "Judul di katalog", value: products.length, note: "Seluruh koleksi buku", tone: "accent" },
        { label: "Buku tersedia", value: products.reduce((sum, p) => sum + p.stock, 0).toLocaleString("id-ID"), note: "Total unit di rak" },
        { label: "Stok menipis", value: products.filter(p => p.stock > 0 && p.stock <= 5).length, note: "Sisa 1–5 unit", tone: "warning" },
        { label: "Stok habis", value: products.filter(p => p.stock <= 0).length, note: "Perlu diisi kembali" },
      ]} />
      <section className="workspace-panel">
        <PanelHeading title="Katalog buku" description={filtered.length + " dari " + products.length + " judul"} actions={<Link href="/stock/categories" className="workspace-button">Kelola kategori</Link>} />
        <div className="workspace-toolbar">
          <SearchField label="Cari judul atau barcode" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger aria-label="Filter kategori produk" className="min-h-11 w-full sm:w-52" placeholder="Semua kategori" />
            <SelectContent><SelectItem index={0} value="all">Semua kategori</SelectItem>{categories.map((c,i) => <SelectItem key={c.id} index={i+1} value={c.id}><CategoryName c={c} /></SelectItem>)}</SelectContent>
          </Select>
          <select aria-label="Filter stok" value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3 text-sm"><option value="all">Semua stok</option><option value="low">Stok menipis</option><option value="empty">Stok habis</option></select>
        </div>
        <div className="catalog-head" aria-hidden="true"><span>Buku / kategori</span><span>Harga jual</span><span className="catalog-sales">Terjual</span><span>Stok</span><span className="text-right">Tindakan</span></div>
        {filtered.map(p => {
          const thumb = productImageUrl(p.imagePath);
          const stats = getSoldStats(p.id);
          const isExp = expandedId === p.id;
          return <article key={p.id} className="catalog-entry">
            <div className="catalog-row">
              <div className="catalog-identity flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setDetailProduct(p)} aria-label={"Lihat sampul dan detail " + p.name} className="catalog-cover">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <ImageIcon size={20} className="text-muted-foreground" />}</button>
                <div className="min-w-0"><Link href={"/stock/products/" + p.id} className="font-semibold leading-relaxed hover:underline">{p.name}</Link><p className="mt-1 text-xs text-muted-foreground">{getCat(p.categoryId)}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{p.barcode || "Tanpa barcode"}</p></div>
              </div>
              <div><span className="font-semibold tabular-nums">{formatRupiah(getDefaultPrice(p))}</span><p className="mt-1 text-[11px] text-muted-foreground">Modal {formatRupiah(p.costPrice ?? 0)}</p><p className="mt-1 text-[11px] text-muted-foreground">Laba {formatRupiah(getLabaPerPcs(p))}/buku</p></div>
              <div className="catalog-sales"><span className="font-medium tabular-nums">{stats.terjual}</span><p className="mt-1 text-[11px] text-muted-foreground">{stats.count} transaksi</p></div>
              <div className="catalog-stock"><span className={p.stock <= 5 ? "font-semibold text-destructive" : "font-semibold"}>{p.stock}</span><p className="mt-1 text-[11px] text-muted-foreground">{p.stock <= 0 ? "Habis" : p.stock <= 5 ? "Menipis" : "Tersedia"}</p></div>
              <div className="catalog-actions">
                <button aria-label={"Riwayat " + p.name} aria-expanded={isExp} aria-controls={"history-"+p.id} onClick={() => setExpandedId(isExp ? null : p.id)} className="workspace-icon">{isExp ? <ChevronUp size={17} /> : <History size={17} />}<span className="text-xs md:hidden">Riwayat</span></button>
                <Link href={"/stock/products/"+p.id+"?edit=1"} aria-label={"Edit " + p.name} className="workspace-icon"><Pencil size={16} /><span className="text-xs md:hidden">Edit</span></Link>
                <button aria-label={"Hapus " + p.name} onClick={() => setDeleteTarget({id:p.id,name:p.name})} className="workspace-icon hover:text-destructive"><Trash2 size={16} /><span className="text-xs md:hidden">Hapus</span></button>
              </div>
            </div>
            {isExp && <div id={"history-"+p.id} className="catalog-detail">
              <Metrics items={[{label:"Terjual",value:stats.terjual+" buku"},{label:"Omzet bersih",value:formatRupiah(stats.omzet)},{label:"Modal terpakai",value:formatRupiah(stats.modal)},{label:"Laba penjualan",value:formatRupiah(stats.laba),tone:"accent"}]} />
              <div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">Riwayat penjualan {p.name}</caption><thead><tr className="text-left"><th className="px-3">Invoice / tanggal</th><th className="px-3">Pelanggan</th><th className="px-3 text-right">Jumlah</th><th className="px-3 text-right">Bersih</th><th className="px-3 text-right">Laba</th></tr></thead><tbody>
              {getSalesHistory(p.id).slice(0,30).map(({order,item,allocatedNet}) => <tr key={order.id+item.id} className="border-b border-border"><td className="px-3"><Link className="font-medium hover:underline" href={"/sales/orders/"+order.id}>{order.id}</Link><p className="mt-1 text-muted-foreground">{order.date}</p></td><td className="px-3">{order.customerName}</td><td className="px-3 text-right">{item.quantity}</td><td className="px-3 text-right">{formatRupiah(allocatedNet)}</td><td className="px-3 text-right">{formatRupiah(allocatedNet-(item.costPrice??0)*item.quantity)}</td></tr>)}
              {getSalesHistory(p.id).length===0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada penjualan untuk buku ini.</td></tr>}
              </tbody></table></div><Link href={"/stock/products/"+p.id} className="workspace-button mt-4">Buka detail & riwayat lengkap <ChevronDown className="-rotate-90" size={14} /></Link>
            </div>}
          </article>;
        })}
        {!filtered.length && <EmptyPanel title={products.length ? "Buku tidak ditemukan" : "Katalog masih kosong"} description={products.length ? "Coba kata kunci lain atau reset filter untuk melihat semua buku." : "Tambahkan buku pertama untuk mulai mencatat stok dan penjualan."}>{products.length ? <button className="workspace-button" onClick={() => {setSearch("");setCatFilter("all");setStockFilter("all");}}>Reset filter</button> : <Link className="workspace-button workspace-button-primary" href="/stock/products/new">Tambah produk</Link>}</EmptyPanel>}
      </section>

      <Dialog open={detailProduct !== null} onOpenChange={(open) => { if (!open) setDetailProduct(null); }}>
        <DialogContent size="lg">
          {detailProduct && <>
            <DialogHeader>
              <DialogTitle>{detailProduct.name}</DialogTitle>
              <DialogDescription>Informasi buku dan sampul produk.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[minmax(140px,200px)_1fr]">
              <div className="mx-auto flex aspect-[2/3] w-full max-w-[200px] items-center justify-center self-start overflow-hidden rounded-lg border border-border bg-muted/30">
                {detailProduct.imagePath ? (
                  <img src={productImageUrl(detailProduct.imagePath) ?? undefined} alt={`Sampul ${detailProduct.name}`} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/60"><ImageIcon size={30} /><span className="text-xs">Belum ada sampul</span></div>
                )}
              </div>
              <div className="min-w-0 space-y-3 text-[13px]">
                <div>
                  <h3 className="font-semibold text-foreground">{detailProduct.name}</h3>
                  <p className="mt-0.5 text-muted-foreground">{getCat(detailProduct.categoryId)}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div><dt className="text-[11px] text-muted-foreground">Barcode</dt><dd className="break-all font-mono">{detailProduct.barcode || "Tanpa barcode"}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Stok</dt><dd>{detailProduct.stock}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Tahun terbit</dt><dd>{detailProduct.publishedYear || "-"}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Semester</dt><dd>{detailProduct.semester || "-"}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Modal</dt><dd>{formatRupiah(detailProduct.costPrice ?? 0)}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Harga jual</dt><dd>{formatRupiah(detailProduct.prices.find((price) => price.isDefault)?.price ?? 0)}</dd></div>
                </dl>
                {detailProduct.description && <p className="whitespace-pre-wrap border-t border-border pt-2 text-muted-foreground">{detailProduct.description}</p>}
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => { setDeleteTarget({ id: detailProduct.id, name: detailProduct.name }); setDetailProduct(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10"><Trash2 size={14} /> Hapus</button>
              <Link href={`/stock/products/${detailProduct.id}?edit=1`} onClick={() => setDetailProduct(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"><Pencil size={14} /> Edit</Link>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Produk"
        description={deleteTarget ? `Produk "${deleteTarget.name}" akan dihapus permanen beserta historis pergerakannya.` : ""}
        confirmLabel="Hapus"
        destructive
        onConfirm={() => { if (deleteTarget) deleteProduct(deleteTarget.id); }}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      />
    </div>
  );
}
