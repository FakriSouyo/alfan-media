import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const write = (p,s) => fs.writeFileSync(p,s);
let p='src/app/(app)/dashboard/page.tsx', s=read(p);
s=s.replace('import { useSurface } from "@/lib/surface-context";\n','').replace('import { surfaceClasses } from "@/lib/surface-classes";\n','').replace('import { cn } from "@/lib/utils";\n','');
const icons=s.indexOf('import {\n  TrendingUp,');
const iconsEnd=s.indexOf('\n\nfunction getGreeting',icons);
s=s.slice(0,icons)+`import { Plus, ArrowUpRight, Package, ArrowRight } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Metrics, PanelHeading, EmptyPanel, OrderStatus } from "@/components/workspace";
import { productImageUrl } from "@/components/product-image-upload";`+s.slice(iconsEnd);
s=s.replace('  const substrate = useSurface();','');
let a=s.indexOf('  const stats = [');let b=s.indexOf('  const recentOrders',a);s=s.slice(0,a)+s.slice(b);
a=s.indexOf('  const statusColor:');b=s.indexOf('  return (',a);
s=s.slice(0,a)+`  const pendingCount = orders.filter(o => o.status === "DRAFT" && !o.archived).length;
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
`;
write(p,s);

p='src/app/(app)/reports/sales/page.tsx';s=read(p);
s=s.replace('import { Download,', 'import { Metrics, ReportNav, PanelHeading } from "@/components/workspace";\nimport { Download,');
s=s.replace('  const [expanded,', '  const [view, setView] = useState("invoices");\n  const [expanded,');
s=s.replace('className="p-4 lg:p-6"','className="workspace-page"');
s=s.replace('className="mt-4 flex flex-wrap items-end gap-3"','className="workspace-panel flex flex-wrap items-end gap-4 p-5"');
s=s.replace('      <div className="workspace-panel flex', '      <ReportNav active="sales" />\n      <div className="workspace-panel flex');
s=s.replaceAll('className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"','className="workspace-button disabled:opacity-50"');
a=s.indexOf('      <div className="mt-4 grid grid-cols-2');b=s.indexOf('      <section className=',a);
s=s.slice(0,a)+`      <Metrics items={[
        {label:"Pendapatan bersih",value:amount(report.totalRevenue),tone:"accent"},
        {label:"Transaksi",value:report.totalTransactions},
        {label:"Buku terjual",value:formatNumber(report.totalItems)},
        {label:"Total diskon",value:amount(report.totalDiscount)},
        {label:"Rata-rata transaksi",value:amount(report.averageOrder)},
      ]} />
      <div className="workspace-tabs" role="group" aria-label="Rincian laporan"><button aria-pressed={view==="invoices"} onClick={()=>setView("invoices")}>Per invoice <span className="text-xs text-muted-foreground">{report.invoices.length}</span></button><button aria-pressed={view==="books"} onClick={()=>setView("books")}>Per buku <span className="text-xs text-muted-foreground">{report.books.length}</span></button></div>
`+s.slice(b);
s=s.replace('      <section className="mt-4 rounded-xl border border-border bg-background">','      <section hidden={view!=="invoices"} className="workspace-panel">');
// The second report table is selected independently, without changing its export data.
const second=s.indexOf('      <section hidden={view!=="invoices"}',s.indexOf('      <section hidden={view!=="invoices"}')+1);
if(second>=0) s=s.slice(0,second)+s.slice(second).replace('hidden={view!=="invoices"}','hidden={view!=="books"}');
// The second original section has not yet been replaced by String.replace.
s=s.replace('      <section className="mt-4 rounded-xl border border-border bg-background">','      <section hidden={view!=="books"} className="workspace-panel">');
s=s.replace('<div className="border-b border-border px-4 py-2.5"><h3 className="text-[13px] font-semibold text-foreground">Detail Penjualan per Invoice</h3></div>','<PanelHeading title="Rincian invoice" description="Buka baris invoice untuk melihat buku, diskon, dan alokasi pendapatannya." />');
s=s.replace('className="mt-4 rounded-xl border border-border bg-background p-4"','className="workspace-panel mt-5 p-5"');
s=s.replace('className="mb-2 text-[13px] font-semibold text-foreground">Produk Terlaris','className="mb-4 font-serif text-2xl text-foreground">Buku terlaris');
s=s.replace('className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-[13px] last:border-0"','className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 text-sm last:border-0"');
s=s.replace('className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"','className="workspace-icon"');
s=s.replace('<label className="mb-1 block text-[12px] font-medium text-foreground">Periode</label>','<span className="mb-1 block text-[12px] font-medium text-foreground">Periode</span>').replace('<SelectTrigger className="h-8 w-auto min-w-[150px]"','<SelectTrigger aria-label="Periode laporan" className="h-11 w-auto min-w-[150px]"');
write(p,s);

p='src/app/(app)/reports/inventory/page.tsx';s=read(p);
s=s.replace('import { Download }','import { Metrics, ReportNav, PanelHeading, SearchField, EmptyPanel } from "@/components/workspace";\nimport { Link } from "@/lib/navigation";\nimport { Download, ArrowUpRight }');
s=s.replace('  const [catFilter','  const [search,setSearch] = useState("");\n  const [onlyLow,setOnlyLow] = useState(false);\n  const [catFilter');
s=s.replace('  const handleExportPDF', '  const visibleProducts = productStats.filter(p => (!onlyLow || p.stock <= 5) && (p.name.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")) || p.barcode.includes(search)));\n\n  const handleExportPDF');
s=s.replace('className="p-4 lg:p-6"','className="workspace-page"');
s=s.replaceAll('className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]"','className="workspace-button"');
a=s.indexOf('      {/* Filter */}');b=s.indexOf('      {/* Table */}',a);
s=s.slice(0,a)+`      <ReportNav active="inventory" />
      <Metrics items={[
        {label:"Jumlah judul",value:productStats.length,note:"Sesuai kategori terpilih"},
        {label:"Persediaan saat ini",value:productStats.reduce((sum,p)=>sum+p.stock,0).toLocaleString("id-ID"),note:"Unit buku tersedia",tone:"accent"},
        {label:"Total masuk",value:productStats.reduce((sum,p)=>sum+p.stockIn,0).toLocaleString("id-ID"),note:"Akumulasi pergerakan positif"},
        {label:"Perlu restok",value:lowStock.length,note:"Stok 5 unit atau kurang",tone:"warning"},
      ]} />
      <section className="workspace-panel">
        <PanelHeading title="Pergerakan persediaan" description="Stok masuk, keluar, dan jumlah buku saat ini." actions={<Link href="/stock/products" className="workspace-button">Kelola stok <ArrowUpRight size={16} /></Link>} />
        <div className="workspace-toolbar"><SearchField label="Cari buku atau barcode" value={search} onChange={e=>setSearch(e.target.value)} />
          <Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger aria-label="Kategori inventaris" className="w-full sm:w-52" placeholder="Semua kategori" /><SelectContent><SelectItem index={0} value="all">Semua kategori</SelectItem>{categories.map((c,i)=><SelectItem key={c.id} index={i+1} value={c.id}><CategoryName c={c} /></SelectItem>)}</SelectContent></Select>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={onlyLow} onChange={e=>setOnlyLow(e.target.checked)} className="size-4 accent-primary" />Perlu restok ({lowStock.length})</label>
        </div>
`+s.slice(b);
s=s.replace('      <div className="mt-3 rounded-xl border border-border bg-background">','      <div>');
s=s.replace('{productStats.map((p) => (','{visibleProducts.map((p) => (');
s=s.replace('<div className="font-medium text-foreground">{p.name}</div>','<Link href={"/stock/products/"+p.id} className="font-medium text-foreground hover:underline">{p.name}</Link><p className="mt-1 font-mono text-[11px] text-muted-foreground">{p.barcode || "Tanpa barcode"}</p>');
s=s.replace('className="px-3 py-2 text-right text-emerald-500"','className="px-3 py-2 text-right text-primary"');
s=s.replace('            </tbody>','              {!visibleProducts.length && <tr><td colSpan={5}><EmptyPanel title="Tidak ada buku yang cocok" description="Coba kategori lain atau reset pencarian dan filter stok."><button className="workspace-button" onClick={()=>{setSearch("");setOnlyLow(false);setCatFilter("all");}}>Reset filter</button></EmptyPanel></td></tr>}\n            </tbody>');
s=s.replace('      </div>\n    </div>\n  );','      </div>\n      </section>\n      <p className="mt-3 text-xs text-muted-foreground">Ekspor mencakup seluruh produk dalam kategori terpilih.</p>\n    </div>\n  );');
write(p,s);
