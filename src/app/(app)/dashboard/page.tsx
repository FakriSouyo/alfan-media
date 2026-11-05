"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store-context";
import { useAuth } from "@/lib/auth-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { categoryText } from "@/components/category-label";
import { businessDate, BUSINESS_TIME_ZONE } from "@/lib/business-date";
import { isRecognizedSale } from "@/lib/sales-report";
import { Plus, ArrowUpRight, Package, ArrowRight } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Metrics, PanelHeading, EmptyPanel, OrderStatus } from "@/components/workspace";
import { productImageUrl } from "@/components/product-image-upload";

function getGreeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", hour12: false }).format(new Date()));
  if (h < 12) return "Selamat pagi";
  if (h < 17) return "Selamat siang";
  return "Selamat malam";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { orders, products, categories } = useStore();
  // The page floats inside the inset card (surface-2). Every panel on top of
  // it steps up one level so the ladder reads correctly.


  const recognizedOrders = useMemo(() => orders.filter((order) => isRecognizedSale(order.status)), [orders]);
  const todayStr = businessDate();
  const todayOrders = useMemo(() => recognizedOrders.filter((order) => order.date === todayStr), [recognizedOrders, todayStr]);
  const totalSalesToday = todayOrders.reduce((s, o) => s + o.total, 0);
  const lowStockProducts = useMemo(() => products.filter((p) => p.stock <= 5), [products]);

  // Laba = pendapatan bersih − jumlah modal terpakai.
  // Modal per item di-snapshot di order_items.cost_price saat pesanan dibuat,
  // jadi laba memakai modal yang berlaku ketika barang laku, bukan modal terkini.
  const orderProfit = (o: (typeof orders)[number]) =>
    o.total - o.items.reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0);
  const profitToday = todayOrders.reduce((s, o) => s + orderProfit(o), 0);

  const recentOrders = useMemo(() => [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5), [orders]);

  const pendingCount = orders.filter(o => o.status === "DRAFT" && !o.archived).length;
  const processingCount = orders.filter(o => o.status === "CHECKED_OUT" && !o.archived).length;
  const days = Array.from({length:7},(_,i)=>{
    const date = new Date(todayStr + "T12:00:00+08:00");
    date.setUTCDate(date.getUTCDate() - (6-i));
    const key = businessDate(date);
    return { key, label:new Intl.DateTimeFormat("id-ID",{weekday:"short",timeZone:BUSINESS_TIME_ZONE}).format(date), total:recognizedOrders.filter(o=>o.date===key).reduce((sum,o)=>sum+o.total,0) };
  });
  const maxDay = Math.max(...days.map(day=>day.total),1);
  return (
    <div className="workspace-page">
      <PageHeader title={getGreeting()+", "+(user?.name?.split(" ")[0]??"Admin")+"."} description={new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:BUSINESS_TIME_ZONE}).format(new Date())+" · Ringkasan toko Anda"} actions={<Link href="/sales/new" className="workspace-button workspace-button-primary"><Plus size={17} />Penjualan baru</Link>} />
      <Metrics items={[
        {label:"Penjualan hari ini",value:formatRupiah(totalSalesToday),tone:"accent",note:"Pesanan diproses & selesai"},
        {label:"Laba hari ini",value:formatRupiah(profitToday),note:"Penjualan dikurangi modal"},
        {label:"Pesanan hari ini",value:todayOrders.length,note:"Transaksi tercatat"},
        {label:"Judul tersedia",value:products.length,note:products.reduce((sum,p)=>sum+p.stock,0).toLocaleString("id-ID")+" buku di rak"},
      ]} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="workspace-panel"><PanelHeading title="Penjualan 7 hari" description="Pendapatan bersih per hari" actions={<Link href="/reports/sales" aria-label="Buka laporan penjualan" className="workspace-icon"><ArrowUpRight size={20} /></Link>} />
            <div className="flex items-baseline gap-2 px-5 pt-5"><span className="font-serif text-3xl tracking-tight">{formatRupiah(days.reduce((sum,day)=>sum+day.total,0))}</span><span className="text-xs text-muted-foreground">total</span></div>
            <div className="grid h-48 grid-cols-7 items-end gap-2 p-5 sm:gap-5" role="img" aria-label={"Penjualan tujuh hari: "+days.map(day=>day.label+" "+formatRupiah(day.total)).join(", ")}>
              {days.map((day,i)=><div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={day.key+": "+formatRupiah(day.total)}><div className={"w-full max-w-14 rounded-t-md "+(i===6?"bg-primary":"bg-primary/25")} style={{height:day.total?Math.max(4,day.total/maxDay*110):2}} /><span className={"text-[11px] "+(i===6?"font-semibold":"text-muted-foreground")}>{day.label}</span></div>)}
            </div>
          </section>
          <section className="workspace-panel"><PanelHeading title="Pesanan terbaru" description="Lima pesanan terakhir" actions={<Link href="/sales/orders" className="workspace-button">Lihat semua <ArrowRight size={15} /></Link>} />
            <div className="divide-y divide-border">{recentOrders.map(o=><Link key={o.id} href={"/sales/orders/"+o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 hover:bg-accent"><div className="min-w-0"><p className="break-all text-sm font-semibold">{o.id}</p><p className="mt-1 truncate text-xs text-muted-foreground">{o.customerName} · {o.date}</p></div><div className="space-y-2 text-right"><p className="text-sm font-semibold tabular-nums">{formatRupiah(o.total)}</p><OrderStatus status={o.status} /></div></Link>)}</div>
            {!recentOrders.length && <EmptyPanel title="Belum ada pesanan" description="Mulai penjualan pertama untuk melihat aktivitas toko di sini." />}
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          <section className="workspace-panel"><PanelHeading title="Perlu ditindaklanjuti" /><div className="divide-y divide-border">
            <Link href="/sales/orders" className="flex items-center justify-between gap-3 p-5 hover:bg-accent"><div><p className="text-sm font-medium">Pesanan draft</p><p className="mt-1 text-xs text-muted-foreground">Menunggu diproses</p></div><span className="font-serif text-3xl">{pendingCount}</span></Link>
            <Link href="/sales/orders" className="flex items-center justify-between gap-3 p-5 hover:bg-accent"><div><p className="text-sm font-medium">Dalam proses</p><p className="mt-1 text-xs text-muted-foreground">Periksa sebelum selesai</p></div><span className="font-serif text-3xl">{processingCount}</span></Link>
          </div></section>
          <section className="workspace-panel"><PanelHeading title="Periksa rak" description={lowStockProducts.length+" judul dengan stok ≤ 5"} actions={<Link aria-label="Buka laporan stok" href="/reports/inventory" className="workspace-icon"><ArrowUpRight size={18} /></Link>} />
            <div className="max-h-[360px] overflow-y-auto divide-y divide-border">{lowStockProducts.slice(0,8).map(p=><Link key={p.id} href={"/stock/products/"+p.id} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent"><span className="min-w-0 text-xs leading-relaxed">{p.name}</span><span className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{p.stock}</span></Link>)}</div>
            {!lowStockProducts.length && <p className="p-5 text-sm text-muted-foreground">Semua stok tersedia dengan baik.</p>}
          </section>
        </aside>
      </div>
      <section className="workspace-panel mt-5"><PanelHeading title="Sekilas koleksi" description="Buku dan persediaan di katalog" actions={<Link href="/stock/products" className="workspace-button">Buka katalog <ArrowRight size={15} /></Link>} />
        <div className="grid divide-y divide-border sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0">{products.slice(0,4).map(p=><Link key={p.id} href={"/stock/products/"+p.id} className="flex min-w-0 gap-3 p-5 hover:bg-accent"><div className="catalog-cover">{p.imagePath?<img src={productImageUrl(p.imagePath)??undefined} alt="" loading="lazy" />:<Package size={20} />}</div><div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{p.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{categoryText(categories.find(c=>c.id===p.categoryId))}</p><p className="mt-2 text-xs font-semibold">{p.stock} buku tersedia</p></div></Link>)}</div>
      </section>
    </div>
  );
}
