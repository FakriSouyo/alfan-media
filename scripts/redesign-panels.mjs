import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const write = (p, s) => fs.writeFileSync(p, s);
const replace = (s, a, b) => { if (!s.includes(a)) throw Error('Missing anchor: '+a.slice(0,80)); return s.replace(a,b); };
let p = 'src/app/(app)/stock/products/page.tsx';
let s = read(p);
s = s.replace('Fragment, ', '').replace('Eye, ', '').replace('TrendingUp, ', '');
s = s.replace('import type { Product }', 'import { Metrics, PanelHeading, SearchField, EmptyPanel } from "@/components/workspace";\nimport type { Product }');
s = s.replace('const [catFilter', 'const [stockFilter, setStockFilter] = useState("all");\n  const [catFilter');
s = s.replace('return matchSearch && matchCat;', 'return matchSearch && matchCat && (stockFilter === "all" || (stockFilter === "low" ? p.stock > 0 && p.stock <= 5 : p.stock <= 0));').replace('[products, search, catFilter]', '[products, search, catFilter, stockFilter]');
s = s.replace('className="p-4 lg:p-6"', 'className="workspace-page"').replace('description="Kelola data produk buku."','description="Rak buku, harga, dan ketersediaan dalam satu tempat."');
s = s.replace('className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-foreground/[0.04]"', 'className="workspace-button"');
const start = s.indexOf('      {/* Filters */}');
const end = s.indexOf('      <Dialog open={detailProduct');
s = s.slice(0,start) + `      <Metrics items={[
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

` + s.slice(end);
write(p,s);

p='src/app/(app)/sales/orders/page.tsx';s=read(p);
s=s.replace('Eye, ListFilter,', 'ArrowUpRight, MoreHorizontal, Plus,');
const selectStart=s.indexOf('import {\n  Select,');
const selectEnd=s.indexOf('\n\nexport default',selectStart);
s=s.slice(0,selectStart)+'import { Metrics, PanelHeading, SearchField, EmptyPanel, OrderStatus } from "@/components/workspace";'+s.slice(selectEnd);
const colorStart=s.indexOf('  const statusColor:');
const labelStart=s.indexOf('  const statusLabel:',colorStart);
s=s.slice(0,colorStart)+s.slice(labelStart);
const retStart=s.indexOf('    <div className="p-4 lg:p-6">');
const confirms=s.indexOf('      <ConfirmDialog',retStart);
s=s.slice(0,retStart)+`    <div className="workspace-page">
      <PageHeader title="Pesanan" description="Pantau pesanan, proses penjualan, dan siapkan pengiriman." actions={<Link href="/sales/new" className="workspace-button workspace-button-primary"><Plus size={16} /> Penjualan baru</Link>} />
      <Metrics items={[
        {label:"Pesanan aktif", value:orders.filter(o=>!o.archived && o.status!=="CANCELLED").length,note:"Tidak termasuk arsip",tone:"accent"},
        {label:"Menunggu proses",value:orders.filter(o=>!o.archived && o.status==="DRAFT").length,note:"Pesanan draft"},
        {label:"Sedang diproses",value:orders.filter(o=>!o.archived && o.status==="CHECKED_OUT").length,note:"Siap diselesaikan"},
        {label:"Selesai",value:orders.filter(o=>!o.archived && o.status==="COMPLETED").length,note:"Transaksi final"},
      ]} />
      <div className="workspace-tabs" role="group" aria-label="Filter status pesanan">{["all","DRAFT","CHECKED_OUT","COMPLETED","CANCELLED"].map(status=><button key={status} aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)}>{status==="all"?"Semua":statusLabel[status]}<span className="rounded bg-muted px-1.5 text-[10px] tabular-nums">{orders.filter(o=>(showArchived||!o.archived)&&(status==="all"||o.status===status)).length}</span></button>)}</div>
      <section className="workspace-panel !overflow-visible">
        <PanelHeading title="Daftar pesanan" description={filtered.length + " pesanan ditampilkan"} />
        <div className="workspace-toolbar"><SearchField label="Cari invoice atau pelanggan" value={search} onChange={e=>setSearch(e.target.value)} /><label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} className="size-4 accent-primary" />Tampilkan arsip</label></div>
        <div className="order-row order-row-header" aria-hidden="true"><span>Invoice</span><span className="order-customer">Pelanggan</span><span>Status</span><span>Total pesanan</span><span>Tindakan</span></div>
        {filtered.map(o=><article key={o.id} className="order-row">
          <div className="min-w-0"><Link className="break-all font-semibold hover:underline" href={"/sales/orders/"+o.id}>{o.id}</Link><small>{o.date}</small><small className="xl:hidden">{o.customerName}</small></div>
          <div className="order-customer min-w-0"><p className="break-words">{o.customerName}</p><small>{o.items.reduce((sum,i)=>sum+i.quantity,0)} buku · {o.items.length} judul</small></div>
          <div><OrderStatus status={o.status} />{o.archived && <small>Diarsipkan</small>}</div>
          <div className="order-total font-semibold tabular-nums">{formatRupiah(o.total)}</div>
          <div className="order-controls flex items-center justify-end"><Link aria-label={"Detail " + o.id} title="Buka detail" href={"/sales/orders/"+o.id} className="workspace-icon"><ArrowUpRight size={18} /></Link>
            <details className="order-actions"><summary aria-label={"Tindakan " + o.id} className="workspace-icon"><MoreHorizontal size={18} /></summary><div className="order-action-menu" onClick={e=>e.currentTarget.closest("details")?.removeAttribute("open")}>
              {o.status==="DRAFT" && <button onClick={()=>setCheckoutTarget(o.id)}><ShoppingCart size={15} />Proses pesanan</button>}
              {o.status==="CHECKED_OUT" && <button onClick={()=>setCompleteTarget(o.id)}><CheckCircle2 size={15} />Tandai selesai</button>}
              {o.status==="COMPLETED" && !o.archived && <button onClick={()=>setArchiveTarget(o.id)}><Archive size={15} />Arsipkan</button>}
              {(o.status==="CHECKED_OUT" || o.status==="COMPLETED") && <><button onClick={()=>printThermalNota(o)}><Printer size={15} />Cetak nota</button><button onClick={()=>printSuratJalan(o)}><FileText size={15} />Cetak surat jalan</button></>}
              <button onClick={()=>setDeleteTarget(o.id)} className="text-destructive"><Trash2 size={15} />Hapus pesanan</button>
            </div></details>
          </div>
        </article>)}
        {!filtered.length && <EmptyPanel title="Belum ada pesanan yang cocok" description="Ubah pencarian atau status untuk melihat pesanan lainnya."><button className="workspace-button" onClick={()=>{setSearch("");setStatusFilter("all");}}>Reset filter</button></EmptyPanel>}
      </section>

`+s.slice(confirms);
write(p,s);
