"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName } from "@/components/category-label";
import { BarcodeScanPanel, ScanStatusDot } from "@/components/barcode-scan-panel";
import type { ScanStatus } from "@/hooks/use-barcode-scanner";
import { Search, Plus, Minus, Trash2, ShoppingCart, UserRound, Truck, ScanBarcode, ImageIcon } from "lucide-react";
import { productImageUrl } from "@/components/product-image-upload";
import { cn } from "@/lib/utils";
import type { OrderItem, SuratJalan } from "@/lib/types";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

interface CartItem {
  productId: string;
  productName: string;
  productBarcode: string;
  quantity: number;
  unitPrice: number;
  priceTier: string;
  customPrice: number | null;
  discountPercent: number;
  subtotal: number;
}

export default function NewSalePage() {
  const router = useRouter();
  const { products, categories, addOrder } = useStore();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  // Mode scan berkelanjutan: toggle sekali, kamera terus menyala.
  const [scanMode, setScanMode] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("off");
  const scanPanelRef = useRef<HTMLDivElement>(null);

  const toggleScan = () => {
    if (scanMode) setScanStatus("off");
    setScanMode((v) => !v);
  };

  // Di mobile panel scan ada di atas (kolom produk) sedangkan tombol toggle
  // ada di keranjang (bawah) — gulir ke panel saat mode dinyalakan.
  useEffect(() => {
    if (scanMode && typeof window !== "undefined" && window.innerWidth < 1024) {
      scanPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scanMode]);

  // Detail pengiriman untuk surat izin jalan.
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<SuratJalan>({
    no: "",
    tanggal: new Date().toISOString().slice(0, 10),
    pengirim: "Alfan Media",
    penerima: "",
    estimasi: "",
    namaPengirim: "",
    kendaraan: "",
    catatan: "",
  });

  const openDelivery = () => {
    // Kalau penerima belum diisi, ikuti nama pelanggan di keranjang.
    setDeliveryForm((f) => ({
      ...f,
      penerima: f.penerima.trim() || customerName.trim(),
    }));
    setDeliveryOpen(true);
  };

  const deliveryFilled =
    deliveryForm.estimasi.trim() ||
    deliveryForm.namaPengirim.trim() ||
    deliveryForm.kendaraan.trim() ||
    deliveryForm.catatan.trim() ||
    deliveryForm.penerima.trim() ||
    deliveryForm.tanggal
      ? true
      : false;

  // Selalu tampilkan buku yang tersedia; pencarian hanya mempersempit list.
  const filteredProducts = products.filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
  );

  // Penjualan walk-in (pelanggan langsung): harga item default tier "Normal"
  // (atau harga default produk). Tier tetap bisa diubah per baris di keranjang.
  const priceTier = "Normal";

  const getPrice = (product: typeof products[0], tier: string) => {
    const tierPrice = product.prices.find((p) => p.tierName === tier);
    const defaultPrice = product.prices.find((p) => p.isDefault);
    return tierPrice?.price ?? defaultPrice?.price ?? 0;
  };

  const addToCart = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const existing = cart.find((c) => c.productId === productId);
    if (existing) {
      // Anti-oversell: jangan biarkan kuantitas keranjang melewati stok.
      if (existing.quantity + 1 > product.stock) {
        alert(`Stok ${product.name} hanya ${product.stock} pcs.`);
        return;
      }
      setCart(cart.map((c) => c.productId === productId ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unitPrice * (1 - c.discountPercent / 100) } : c));
    } else {
      const unitPrice = getPrice(product, priceTier);
      setCart([...cart, {
        productId,
        productName: product.name,
        productBarcode: product.barcode,
        quantity: 1,
        unitPrice,
        priceTier,
        customPrice: null,
        discountPercent: 0,
        subtotal: unitPrice,
      }]);
    }
    setSearch("");
  };

  // Dipakai mode scan (kamera/manual) & scanner USB: cari produk per barcode
  // lalu masukkan ke keranjang. Return null = sukses, string = pesan error.
  const handleScan = (raw: string): string | null => {
    const code = raw.trim();
    if (!code) return null;
    const product = products.find((p) => p.barcode === code);
    if (!product) return `Tidak ada produk dengan barcode ${code}`;
    if (product.stock <= 0) return `${product.name} sedang habis`;
    addToCart(product.id);
    return null;
  };

  // Enter di kotak cari = perilaku scanner USB: kode barcode persis (atau
  // hasil tunggal) langsung masuk keranjang.
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    const match =
      products.find((p) => p.barcode === q) ??
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (!match) return;
    if (match.stock <= 0) {
      setSearch("");
      return;
    }
    addToCart(match.id);
  };

  const updateCart = (idx: number, patch: Partial<CartItem>) => {
    setCart(cart.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, ...patch };
      const effectivePrice = next.customPrice ?? next.unitPrice;
      next.subtotal = Math.round(next.quantity * effectivePrice * (1 - next.discountPercent / 100));
      return next;
    }));
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((s, c) => {
    const base = c.quantity * (c.customPrice ?? c.unitPrice);
    return s + base;
  }, 0);
  const itemDiscounts = cart.reduce((s, c) => {
    const base = c.quantity * (c.customPrice ?? c.unitPrice);
    return s + Math.round(base * c.discountPercent / 100);
  }, 0);
  const totalDiscount = itemDiscounts + Math.round(subtotal * orderDiscount / 100);
  const total = subtotal - totalDiscount;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    // Verifikasi akhir vs stok saat ini (state store bisa terlambat satu refresh).
    const short = cart.filter((c) => c.quantity > (products.find((p) => p.id === c.productId)?.stock ?? 0));
    if (short.length > 0) {
      alert(`Stok tidak mencukupi: ${short.map((s) => s.productName).join(", ")}. Perbarui data stok dulu.`);
      return;
    }
    const orderItems: OrderItem[] = cart.map((c, i) => ({
      id: "oi-" + Date.now() + "-" + i,
      productId: c.productId,
      productName: c.productName,
      productBarcode: c.productBarcode,
      quantity: c.quantity,
      unitPrice: c.customPrice ?? c.unitPrice,
      priceTier: c.priceTier,
      customPrice: c.customPrice,
      discountPercent: c.discountPercent,
      subtotal: c.subtotal,
      // Snapshot modal untuk perhitungan laba (store juga fallback ke ini).
      costPrice: products.find((p) => p.id === c.productId)?.costPrice ?? 0,
    }));
    const order = await addOrder({
      date: new Date().toISOString().slice(0, 10),
      customerId: null,
      customerName: customerName.trim() || "Pelanggan",
      items: orderItems,
      subtotal,
      discount: totalDiscount,
      total,
      status: "CHECKED_OUT",
      suratJalan: {
        ...deliveryForm,
        no: "",
        penerima: deliveryForm.penerima.trim() || customerName.trim() || "Pelanggan",
      },
    });
    if (!order) {
      alert("Gagal membuat pesanan. Periksa kembali data pesanan.");
      return;
    }
    if (order.status === "DRAFT") {
      // Stok tak cukup saat disimpan → store menurunkan jadi DRAFT.
      alert(`Stok tidak mencukupi — pesanan disimpan sebagai DRAFT (${order.id}). Tambah stok, lalu proses dari daftar Pesanan.`);
      return;
    }
    router.push(`/sales/orders/${order.id}`);
  };

  const handleSaveDraft = async () => {
    if (cart.length === 0) return;
    const orderItems: OrderItem[] = cart.map((c, i) => ({
      id: "oi-" + Date.now() + "-" + i,
      productId: c.productId,
      productName: c.productName,
      productBarcode: c.productBarcode,
      quantity: c.quantity,
      unitPrice: c.customPrice ?? c.unitPrice,
      priceTier: c.priceTier,
      customPrice: c.customPrice,
      discountPercent: c.discountPercent,
      subtotal: c.subtotal,
      // Snapshot modal untuk perhitungan laba (store juga fallback ke ini).
      costPrice: products.find((p) => p.id === c.productId)?.costPrice ?? 0,
    }));
    await addOrder({
      date: new Date().toISOString().slice(0, 10),
      customerId: null,
      customerName: customerName.trim() || "Pelanggan",
      items: orderItems,
      subtotal,
      discount: totalDiscount,
      total,
      status: "DRAFT",
    });
    setCart([]);
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Penjualan Baru" description="Tambah produk ke keranjang dan checkout." />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Left: Search + Product list */}
        <div className="flex flex-col gap-3">
          {/* Mode scan berkelanjutan — toggle dari tombol di keranjang */}
          {scanMode && (
            <div ref={scanPanelRef} className="scroll-mt-4">
              <BarcodeScanPanel
                onScan={handleScan}
                onStatus={setScanStatus}
                onStop={() => {
                  setScanStatus("off");
                  setScanMode(false);
                }}
              />
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari produk atau scan barcode (Enter)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKeyDown}
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Product list — always shows available books; search narrows it */}
          <div className="rounded-xl border border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-[13px] font-semibold text-foreground">Produk</span>
              <span className="text-[11px] text-muted-foreground">{filteredProducts.length} item</span>
            </div>
            {filteredProducts.length === 0 ? (
              <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">Tidak ada produk</div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto sm:max-h-[400px]">
                {filteredProducts.map((p) => {
                  const cat = categories.find((c) => c.id === p.categoryId);
                  const thumb = productImageUrl(p.imagePath);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-foreground/[0.03] first:rounded-t-xl last:rounded-b-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      disabled={p.stock <= 0}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon size={16} className="text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">{p.name}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {cat ? (
                            <CategoryName c={cat} className="truncate" badgeClassName="bg-foreground/[0.07] text-[10px]" />
                          ) : (
                            <span className="truncate font-mono">{p.barcode || "Tanpa barcode"}</span>
                          )}
                          <span className="shrink-0">· Stok: {p.stock}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium text-foreground">{formatRupiah(getPrice(p, priceTier))}</div>
                        {p.stock <= 0 && <div className="text-[11px] text-destructive">Habis</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className="rounded-xl border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <ShoppingCart size={14} className="text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">Keranjang</span>
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{cart.length} item</span>
            <button
              onClick={toggleScan}
              title={scanMode ? "Matikan mode scan" : "Aktifkan mode scan barcode"}
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium text-foreground",
                scanMode ? "border-foreground/30 bg-foreground/[0.06]" : "border-border hover:bg-foreground/[0.04]"
              )}
            >
              <ScanStatusDot status={scanMode ? scanStatus : "off"} />
              <ScanBarcode size={14} /> {scanMode ? "Stop" : "Scan"}
            </button>
          </div>

          {/* Optional customer name — dipakai untuk surat jalan */}
          <div className="border-b border-border/60 px-3 py-2">
            <div className="relative">
              <UserRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nama pelanggan (opsional) — default Pelanggan"
                className="h-8 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <ShoppingCart size={24} className="text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-foreground">Keranjang kosong</p>
                <p className="text-[11px] text-muted-foreground">Pilih buku di samping atau scan barcode</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-2">
                {/* header kecil: jumlah + kosongkan */}
                <div className="flex items-center justify-between px-1 py-1 text-[11px] text-muted-foreground">
                  <span>{cart.reduce((a,c)=>a+c.quantity,0)} buku · {cart.length} judul</span>
                  <button onClick={()=>setCart([])} className="text-[11px] text-destructive hover:underline">Kosongkan</button>
                </div>
                {cart.map((item, idx) => {
                  const itemProduct = products.find((p) => p.id === item.productId);
                  const cat = itemProduct ? categories.find((c) => c.id === itemProduct.categoryId) : undefined;
                  const thumb = productImageUrl(itemProduct?.imagePath);
                  const base = (item.customPrice ?? item.unitPrice) * item.quantity;
                  const discAmt = Math.round(base * item.discountPercent / 100);
                  const isDisc = item.discountPercent > 0;
                  return (
                  <div key={idx} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    {/* baris 1: gambar + nama + hapus */}
                    <div className="flex gap-2.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={item.productName} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon size={15} className="text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold leading-tight text-foreground">{item.productName}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {cat ? <CategoryName c={cat} badgeClassName="bg-foreground/[0.07] text-[10px]" /> : <span className="font-mono">{item.productBarcode || "Tanpa barcode"}</span>}
                          <span className="hidden sm:inline font-mono">· {item.productBarcode || "Tanpa barcode"}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">{item.priceTier}</span>
                          <span className="text-muted-foreground">{formatRupiah(item.customPrice ?? item.unitPrice)} /pcs</span>
                          {itemProduct && <span className="text-muted-foreground/60">· stok {itemProduct.stock}</span>}
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(idx)} title="Hapus" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>
                    </div>

                    {/* baris 2: qty + diskon buku */}
                    <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                      <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                        <button onClick={() => updateCart(idx, { quantity: Math.max(1, item.quantity - 1) })} className="flex size-7 items-center justify-center rounded-md hover:bg-foreground/[0.06] text-foreground"><Minus size={13} /></button>
                        <span className="w-9 text-center text-[13px] font-semibold text-foreground">{item.quantity}</span>
                        <button
                          onClick={() => updateCart(idx, { quantity: item.quantity + 1 })}
                          disabled={item.quantity >= (itemProduct?.stock ?? 0)}
                          title={item.quantity >= (itemProduct?.stock ?? 0) ? `Stok maksimal ${itemProduct?.stock ?? 0}` : undefined}
                          className="flex size-7 items-center justify-center rounded-md hover:bg-foreground/[0.06] text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        ><Plus size={13} /></button>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
                        <span className="whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">Diskon<br/>buku ini</span>
                        <div className="ml-auto flex items-center gap-1">
                          <input
                            type="number"
                            value={item.discountPercent || ""}
                            placeholder="0"
                            onChange={(e) => updateCart(idx, { discountPercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                            className="h-7 w-12 rounded-md border border-border bg-background px-1 text-center text-[12px] font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                            min={0} max={100}
                          />
                          <span className="text-[12px] font-medium text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>

                    {/* tier cepat */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {["Normal","Sekolah","Guru","Member","Distributor"].map((t) => (
                        <button
                          key={t}
                          onClick={()=>{
                            const prod = products.find((p)=>p.id===item.productId);
                            if(!prod) return;
                            const np = getPrice(prod, t);
                            updateCart(idx, { priceTier: t, unitPrice: np, customPrice: null });
                          }}
                          className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", item.priceTier===t ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/30")}
                        >{t}</button>
                      ))}
                    </div>

                    {/* kalkulasi per baris */}
                    <div className="mt-2 flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px]">
                      <span className="text-muted-foreground">
                        {item.quantity} × {formatRupiah(item.customPrice ?? item.unitPrice)}
                        {isDisc && <span className="text-destructive"> −{item.discountPercent}%</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {isDisc && <span className="text-muted-foreground line-through">{formatRupiah(base)}</span>}
                        {isDisc && <span className="text-destructive">−{formatRupiah(discAmt)}</span>}
                        <span className="text-[13px] font-semibold text-foreground">{formatRupiah(item.subtotal)}</span>
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ringkasan — dipisah jelas jadi 2 kelompok diskon */}
          <div className="border-t border-border bg-muted/20 px-3 py-3">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ringkasan Biaya</div>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal ({cart.reduce((a,c)=>a+c.quantity,0)} buku)</span>
                  <span className="font-medium text-foreground">{formatRupiah(subtotal)}</span>
                </div>
                {itemDiscounts > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span className="flex items-center gap-1.5"><span className="inline-flex size-4 items-center justify-center rounded-full bg-destructive/15 text-[10px]">−</span> Potongan per buku</span>
                    <span className="font-medium">−{formatRupiah(itemDiscounts)}</span>
                  </div>
                )}
                {itemDiscounts > 0 && (
                  <div className="flex justify-between border-b border-dashed border-border pb-1.5 text-[11px] text-muted-foreground">
                    <span></span><span>dari diskon di tiap baris buku</span>
                  </div>
                )}
                {/* Diskon pesanan — kartu kecil terpisah */}
                <div className={cn("rounded-lg border px-2.5 py-2", orderDiscount>0 ? "border-amber-500/30 bg-amber-500/5" : "border-dashed border-border bg-muted/30")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-foreground">Diskon Pesanan</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={orderDiscount || ""}
                        placeholder="0"
                        onChange={(e) => setOrderDiscount(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="h-7 w-14 rounded-md border border-border bg-background px-1 text-center text-[12px] font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                        min={0} max={100}
                      />
                      <span className="text-[12px] font-medium">%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">Potongan untuk <b>seluruh pesanan</b> — dihitung setelah potongan per buku.</p>
                  {orderDiscount>0 && (
                    <div className="mt-1 flex justify-between text-[12px] font-medium text-amber-700 dark:text-amber-400">
                      <span>Potongan pesanan</span><span>−{formatRupiah(Math.round(subtotal * orderDiscount / 100))}</span>
                    </div>
                  )}
                </div>
                {totalDiscount>0 && (
                  <div className="flex justify-between rounded-md bg-emerald-500/10 px-2 py-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                    <span>Total hemat</span><span>{formatRupiah(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[13px] font-semibold text-foreground">Total Bayar</span>
                  <span className="text-[18px] font-bold tracking-tight text-foreground">{formatRupiah(total)}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="shrink-0">ⓘ</span>
              <span><b className="text-foreground">Per buku</b> atur di tiap baris (mis. buku rusak). <b className="text-foreground">Pesanan</b> untuk promo keseluruhan (mis. diskon toko 5%).</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 border-t border-border p-3">
            <div className="flex gap-2">
              <button onClick={handleSaveDraft} disabled={cart.length === 0} className="flex-1 rounded-lg border border-border py-2 text-[13px] text-foreground hover:bg-foreground/[0.04] disabled:opacity-40">
                Simpan Draft
              </button>
              <button onClick={handleCheckout} disabled={cart.length === 0} className="flex-1 rounded-lg bg-foreground py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40">
                Checkout
              </button>
            </div>
            <button onClick={openDelivery} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-[12px] text-muted-foreground hover:border-foreground hover:text-foreground">
              <Truck size={13} /> Detail Pengiriman
              <span className={deliveryFilled ? "text-[11px] text-emerald-500" : "text-[11px] text-muted-foreground/70"}>
                {deliveryFilled ? "· terisi" : "(opsional)"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Detail Pengiriman dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Detail Pengiriman</DialogTitle>
            <DialogDescription>
              Isi detail untuk surat izin jalan. Jika kosong, kolom terkait ditampilkan kosong di dokumen cetak.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Pengirim</label>
                <input value={deliveryForm.pengirim} onChange={(e) => setDeliveryForm({ ...deliveryForm, pengirim: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Penerima</label>
                <input value={deliveryForm.penerima} onChange={(e) => setDeliveryForm({ ...deliveryForm, penerima: e.target.value })} placeholder="Nama penerima" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Tanggal Kirim</label>
              <input type="date" value={deliveryForm.tanggal} onChange={(e) => setDeliveryForm({ ...deliveryForm, tanggal: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Estimasi Pengiriman <span className="text-muted-foreground/60">(mis. 2-3 hari kerja)</span></label>
              <input value={deliveryForm.estimasi} onChange={(e) => setDeliveryForm({ ...deliveryForm, estimasi: e.target.value })} placeholder="Opsional" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Nama Pengirim <span className="text-muted-foreground/60">(opsional)</span></label>
                <input value={deliveryForm.namaPengirim} onChange={(e) => setDeliveryForm({ ...deliveryForm, namaPengirim: e.target.value })} placeholder="Nama kurir/pengirim" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">No. Kendaraan <span className="text-muted-foreground/60">(opsional)</span></label>
                <input value={deliveryForm.kendaraan} onChange={(e) => setDeliveryForm({ ...deliveryForm, kendaraan: e.target.value })} placeholder="cth: B 1234 XYZ" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Catatan</label>
              <textarea value={deliveryForm.catatan} onChange={(e) => setDeliveryForm({ ...deliveryForm, catatan: e.target.value })} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <button className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Batal</button>
            </DialogClose>
            <button onClick={() => setDeliveryOpen(false)} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">Simpan</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
