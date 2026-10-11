"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { productImageUrl } from "@/components/product-image-upload";
import { Plus, Pencil, Trash2, Eye, PackagePlus, Search, ImageIcon, ChevronDown, ChevronUp, TrendingUp, History } from "lucide-react";
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
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const { products, categories, orders, deleteProduct, adjustStock } = useStore();
  const [search, setSearch] = useState("");
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
    return matchSearch && matchCat;
  }), [products, search, catFilter]);

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
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Produk"
        description="Kelola data produk buku."
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={addStockOpen} onOpenChange={(o) => { setAddStockOpen(o); if (!o) resetStockForm(); }}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-foreground/[0.04]">
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
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
            >
              <Plus size={14} /> Tambah Produk
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Cari nama atau barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[168px]" placeholder="Semua Kategori" />
          <SelectContent>
            <SelectItem index={0} value="all">Semua Kategori</SelectItem>
            {categories.map((c, i) => (
              <SelectItem key={c.id} index={i + 1} value={c.id}><CategoryName c={c} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground bg-muted/20">
                <th className="w-8 px-2 py-2"></th>
                <th className="px-3 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Kategori</th>
                <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Modal</th>
                <th className="px-3 py-2 font-medium text-right">Harga</th>
                <th className="px-3 py-2 font-medium text-right">Laba/pcs</th>
                <th className="px-3 py-2 font-medium text-right">Terjual</th>
                <th className="px-3 py-2 font-medium text-right">Stok</th>
                <th className="px-3 py-2 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const thumb = productImageUrl(p.imagePath);
                const labaPcs = getLabaPerPcs(p);
                const stats = getSoldStats(p.id);
                const isExp = expandedId === p.id;
                const labaColor = labaPcs > 0 ? "text-emerald-600 dark:text-emerald-400" : labaPcs < 0 ? "text-destructive" : "text-muted-foreground";
                return (
                // The key belongs on the fragment: it is the element the map
                // returns, and each entry renders a main row plus an optional
                // detail row.
                <Fragment key={p.id}>
                <tr className={`border-b border-border/50 last:border-0 hover:bg-foreground/[0.02] ${isExp ? "bg-muted/30" : ""}`}>
                  <td className="px-2 py-2">
                    <button onClick={()=> setExpandedId(isExp ? null : p.id)} className="flex size-6 items-center justify-center rounded-md border border-border bg-background hover:bg-foreground/[0.06]">
                      {isExp ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                      <button type="button" onClick={() => setDetailProduct(p)} aria-label={`Lihat sampul dan detail ${p.name}`} className="flex aspect-[2/3] w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <ImageIcon size={16} className="text-muted-foreground/40" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <button type="button" onClick={() => setDetailProduct(p)} className="text-left font-medium text-foreground leading-tight hover:underline focus:outline-none focus:underline">{p.name}</button>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="md:hidden">{getCat(p.categoryId)}</span>
                          <span className="hidden md:inline font-mono text-[11px]">{p.barcode || "Tanpa barcode"}</span>
                          <span className="md:hidden font-mono">· {p.barcode ? p.barcode.slice(-4) : "tanpa barcode"}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{getCat(p.categoryId)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-muted-foreground hidden lg:table-cell">{formatRupiah(p.costPrice ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatRupiah(getDefaultPrice(p))}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${labaColor}`}>
                    <span className="inline-flex items-center gap-1 justify-end"><TrendingUp size={11} className="opacity-60"/>{formatRupiah(labaPcs)}</span>
                    <div className="text-[10px] font-normal opacity-70">{getDefaultPrice(p)>0 ? Math.round(labaPcs/getDefaultPrice(p)*100):0}%</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="font-medium text-foreground">{stats.terjual}</div>
                    <div className="text-[10px] text-muted-foreground">{stats.count} trx</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-flex min-w-7 justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${p.stock<=2 ? "bg-destructive text-destructive-foreground" : p.stock<=5 ? "bg-amber-500/15 text-amber-600" : "bg-foreground/[0.07] text-foreground"}`}>{p.stock}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-0.5">
                      <Link href={`/stock/products/${p.id}`} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"><Eye size={13} /></Link>
                      <Link href={`/stock/products/${p.id}?edit=1`} className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"><Pencil size={13} /></Link>
                      <button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
                {isExp && (
                  <tr className="bg-muted/20">
                    <td colSpan={9} className="px-3 py-3">
                      {/* ringkasan profit */}
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-background p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Terjual</div>
                          <div className="text-[14px] font-bold text-foreground">{stats.terjual} pcs</div>
                          <div className="text-[11px] text-muted-foreground">{stats.count} transaksi</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Omzet bersih</div>
                          <div className="text-[13px] font-semibold text-foreground">{formatRupiah(stats.omzet)}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modal terpakai</div>
                          <div className="text-[13px] font-medium text-muted-foreground">{formatRupiah(stats.modal)}</div>
                        </div>
                        <div className={`rounded-lg border p-2.5 ${stats.laba>=0 ? "border-emerald-500/20 bg-emerald-500/10" : "border-destructive/20 bg-destructive/10"}`}>
                          <div className="text-[10px] uppercase tracking-wide opacity-70">Laba total</div>
                          <div className={`text-[13px] font-bold ${stats.laba>=0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{formatRupiah(stats.laba)}</div>
                          <div className="text-[11px] opacity-70">{stats.omzet>0 ? Math.round(stats.laba/stats.omzet*100):0}% margin</div>
                        </div>
                      </div>

                      {/* riwayat pembelian / penjualan */}
                      <div className="rounded-lg border border-border bg-background overflow-hidden">
                        <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
                          <History size={13} className="text-muted-foreground"/>
                          <span className="text-[12px] font-semibold text-foreground">Riwayat Penjualan</span>
                          <span className="text-[11px] text-muted-foreground">— dropdown per transaksi</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">{getSalesHistory(p.id).length} baris</span>
                        </div>
                        {getSalesHistory(p.id).length===0 ? (
                          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">Belum pernah terjual</div>
                        ) : (
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-[11px]">
                              <thead className="sticky top-0 bg-background">
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="px-2.5 py-1.5 text-left font-medium">Tanggal / Invoice</th>
                                  <th className="px-2.5 py-1.5 text-left font-medium hidden sm:table-cell">Pelanggan</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Qty</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Harga</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium hidden sm:table-cell">Modal</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">Laba</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getSalesHistory(p.id).slice(0,30).map(({order, item, allocatedNet})=>{
                                  const discPesanan = Math.max(0, item.subtotal - allocatedNet);
                                  const revenue = allocatedNet;
                                  const cost = (item.costPrice ?? 0)*item.quantity;
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
                                        {item.discountPercent>0 && <div className="text-destructive">−{item.discountPercent}%</div>}
                                        {discPesanan>0 && <div className="text-amber-600 text-[10px]">−{formatRupiah(discPesanan)} pesan</div>}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-right text-muted-foreground hidden sm:table-cell">{formatRupiah(cost)}</td>
                                      <td className={`px-2.5 py-1.5 text-right font-semibold ${laba>=0?"text-emerald-600 dark:text-emerald-400":"text-destructive"}`}>{formatRupiah(laba)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {getSalesHistory(p.id).length>30 && <div className="px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">+{getSalesHistory(p.id).length-30} transaksi lagi — lihat detail produk</div>}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Link href={`/stock/products/${p.id}`} className="text-[11px] font-medium text-foreground hover:underline">Buka halaman produk →</Link>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Tidak ada produk</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  // eslint-disable-next-line @next/next/no-img-element
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
