"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Pencil, Trash2, Eye, PackagePlus, Search } from "lucide-react";
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

export default function ProductsPage() {
  const { products, categories, deleteProduct, adjustStock } = useStore();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  // "Tambah Stok" dialog — add quantity to an existing product.
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockQty, setStockQty] = useState(1);
  const [stockRef, setStockRef] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [stockError, setStockError] = useState("");

  // Dialog konfirmasi hapus produk.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filteredForPick = productSearch
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.barcode.includes(productSearch)
      )
    : products;

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search);
    const matchCat = catFilter === "all" || p.categoryId === catFilter;
    return matchSearch && matchCat;
  });

  const getCat = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? categoryText(c) : "-";
  };
  const getDefaultPrice = (p: typeof products[0]) => p.prices.find((pr) => pr.isDefault)?.price ?? 0;

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
      <div className="mt-3 rounded-xl border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Kategori</th>
                <th className="px-3 py-2 font-medium hidden lg:table-cell">Barcode</th>
                <th className="px-3 py-2 font-medium text-right">Harga</th>
                <th className="px-3 py-2 font-medium text-right">Stok</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Semester</th>
                <th className="px-3 py-2 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground md:hidden">{getCat(p.categoryId)}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{getCat(p.categoryId)}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground hidden lg:table-cell">{p.barcode}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatRupiah(getDefaultPrice(p))}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={p.stock <= 5 ? "font-semibold text-destructive" : "text-foreground"}>{p.stock}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.semester}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/stock/products/${p.id}`} className="rounded p-1 text-muted-foreground hover:text-foreground"><Eye size={14} /></Link>
                      <Link href={`/stock/products/${p.id}?edit=1`} className="rounded p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></Link>
                      <button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Tidak ada produk</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
