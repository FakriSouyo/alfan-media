import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const write=(p,s)=>fs.writeFileSync(p,s);
let p='src/app/(app)/sales/new/page.tsx',s=read(p);
s=s.replace('import { useRouter }','import { PanelHeading, EmptyPanel } from "@/components/workspace";\nimport { Link, useRouter }');
s=s.replace('import { CategoryName }','import { CategoryName, categoryText }');
s=s.replace('  const [search,','  const [categoryFilter, setCategoryFilter] = useState("all");\n  const [search,');
s=s.replace('return products.filter((p) => !query || p.name.toLowerCase().includes(query) || p.barcode.trim().toLowerCase().includes(query));','return products.filter((p) => (categoryFilter === "all" || p.categoryId === categoryFilter) && (!query || p.name.toLowerCase().includes(query) || p.barcode.trim().toLowerCase().includes(query)));').replace('}, [products, search]);','}, [products, search, categoryFilter]);');
s=s.replace('className="p-4 lg:p-6"','className="workspace-page"');
s=s.replace('<PageHeader title="Penjualan Baru" description="Tambah produk ke keranjang dan checkout." />','<PageHeader title="Meja kasir" description="Pilih buku, atur jumlah, lalu proses pesanan." actions={<div className="flex flex-wrap gap-2"><Link href="/sales/orders" className="workspace-button">Daftar pesanan</Link><a href="#cart" className="workspace-button xl:hidden"><ShoppingCart size={16} />Keranjang ({cart.reduce((sum,item)=>sum+item.quantity,0)})</a></div>} />');
s=s.replace('xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.58fr)]','xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]');
const a=s.indexOf('          {/* Product list');const b=s.indexOf('        {/* Right: Cart */}',a);
s=s.slice(0,a)+`          <select aria-label="Kategori buku kasir" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"><option value="all">Semua kategori</option>{categories.map(c=><option key={c.id} value={c.id}>{categoryText(c)}</option>)}</select>
          <section className="workspace-panel"><PanelHeading title="Pilih buku" description={filteredProducts.length+" judul dalam katalog"} />
            {filteredProducts.length===0 ? <EmptyPanel title="Buku tidak ditemukan" description="Cari judul lain atau pilih semua kategori."><button className="workspace-button" onClick={()=>{setSearch("");setCategoryFilter("all");}}>Reset pencarian</button></EmptyPanel> : <div className="pos-books">{filteredProducts.map(p=>{
              const thumb=productImageUrl(p.imagePath); const cat=categoriesById.get(p.categoryId);
              return <button key={p.id} aria-label={"Tambah "+p.name+" ke keranjang"} onClick={()=>addToCart(p.id)} disabled={p.stock<=0} className="pos-book">
                <div className="pos-book-cover">{thumb?<img src={thumb} alt="" loading="lazy" decoding="async" />:<ImageIcon size={25} className="text-muted-foreground" />}</div>
                <span className="line-clamp-2 text-[13px] font-semibold leading-relaxed">{p.name}</span><span className="text-[11px] text-muted-foreground">{categoryText(cat)}</span>
                <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{formatRupiah(getPrice(p,priceTier))}</span><span className={"text-[11px] "+(p.stock<=5?"text-destructive":"text-muted-foreground")}>{p.stock<=0?"Habis":"Stok "+p.stock}</span></span>
              </button>;
            })}</div>}
          </section>
        </div>

`+s.slice(b);
s=s.replace('        {/* Right: Cart */}\n        <div className="rounded-xl border border-border bg-background">','        {/* Right: Cart */}\n        <div id="cart" className="workspace-panel pos-cart scroll-mt-20">');
s=s.replace('className="rounded-xl border border-border bg-card p-3 shadow-sm"','className="border-b border-border p-3"');
s=s.replace('className="rounded-xl border border-border bg-background p-3"','className="p-1"');
s=s.replace('className="flex size-7 items-center','className="flex size-11 items-center');
s=s.replace('className="mt-3 grid grid-cols-[auto_1fr] gap-2"','className="mt-3 flex flex-wrap items-center gap-2"');
s=s.replace('<button onClick={() => removeFromCart(idx)}','<button aria-label={"Hapus " + item.productName + " dari keranjang"} onClick={() => removeFromCart(idx)}');
s=s.replace('<button onClick={() => updateCart(idx, { quantity: Math.max(1, item.quantity - 1) })}', '<button aria-label={"Kurangi jumlah " + item.productName} onClick={() => updateCart(idx, { quantity: Math.max(1, item.quantity - 1) })}');
s=s.replace('                          onClick={() => updateCart(idx, { quantity: item.quantity + 1 })}','                          aria-label={"Tambah jumlah " + item.productName}\n                          onClick={() => updateCart(idx, { quantity: item.quantity + 1 })}');
s=s.replace('                            value={item.discountPercent || ""}','                            aria-label={"Diskon " + item.productName}\n                            value={item.discountPercent || ""}');
s=s.replace('                value={customerName}','                aria-label="Nama pelanggan"\n                value={customerName}');
s=s.replace('placeholder="Nama pelanggan (opsional) — default Pelanggan"','placeholder="Nama pelanggan (opsional)"');
s=s.replace('                        value={orderDiscount || ""}','                        aria-label="Diskon pesanan dalam persen"\n                        value={orderDiscount || ""}');
s=s.replace('className="flex-1 rounded-lg bg-foreground py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"','className="workspace-button workspace-button-primary flex-1"');
s=s.replace('className="flex-1 rounded-lg border border-border py-2 text-[13px] text-foreground hover:bg-foreground/[0.04] disabled:opacity-40"','className="workspace-button flex-1"');
s=s.replace('className="text-[18px] font-bold tracking-tight text-foreground"','className="font-serif text-3xl tracking-tight text-foreground"');
s=s.replace('className="rounded-full border px-2 py-0.5 text-[11px] font-medium"','className="min-h-9 rounded-lg border px-2 py-1 text-[11px] font-medium"');
write(p,s);

p='src/components/agent/agent-chat.tsx';s=read(p);
s=s.replace('className="flex h-[calc(100svh-3rem)] min-h-0 flex-col"','className="agent-workspace flex h-[calc(100svh-3.5rem)] min-h-0 flex-col"');
s=s.replace('className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4"','className="flex min-h-20 shrink-0 items-center justify-between gap-3 border-b border-border px-5 sm:px-8"');
s=s.replace('className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"','className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"');
s=s.replace('<span className="truncate text-sm font-semibold">AI Assistant</span>','<span className="truncate font-serif text-xl">Asisten toko</span>');
s=s.replace('className="rounded-full p-1.5 text-muted-foreground transition-colors','className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors');
s=s.replace('<EmptyState onPick={(p) => void send(p)} />','<EmptyState onPick={setInput} />');
const start=s.indexOf('function EmptyState(');
s=s.slice(0,start)+`function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const icons = [ChartColumn, PackageSearch, ChartColumn, BookPlus];
  return <div className="agent-intro">
    <p className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[.16em] text-primary"><Sparkles size={15} />Alfan Media · Asisten toko</p>
    <h1>Ada yang bisa dibantu<br className="hidden sm:block" /> untuk toko hari ini?</h1>
    <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">Lihat penjualan, telusuri stok, atau siapkan pekerjaan berikutnya.</p>
    <div className="agent-prompts">{QUICK_PROMPTS.map((prompt,i)=>{const Icon=icons[i];return <button key={prompt} type="button" onClick={()=>onPick(prompt)}><Icon size={19} className="mt-0.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 leading-relaxed">{prompt}</span><ArrowRight size={15} className="mt-1 shrink-0 text-muted-foreground" /></button>;})}</div>
    <p className="mt-4 text-xs text-muted-foreground">Pilih saran untuk mengisi pesan, lalu kirim saat siap.</p>
  </div>;
}
`;
// Empty state no longer animates decorative elements; keep animations used by the transcript.
if(!s.includes('<motion.')) s=s.replace('AnimatePresence, motion','AnimatePresence');
write(p,s);
