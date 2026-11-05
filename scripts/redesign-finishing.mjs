import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const write=(p,s)=>fs.writeFileSync(p,s);
let p='src/app/(app)/settings/page.tsx',s=read(p);
s=s.replace('import { Moon, Sun, Download, Loader2, FileJson, Check }','import { useTheme } from "@/lib/theme-context";\nimport { Link } from "@/lib/navigation";\nimport { Moon, Sun, Download, Loader2, FileJson, Check, ArrowUpRight }');
let a=s.indexOf('  // Guard for SSR:');let b=s.indexOf('  const [downloading',a);
s=s.slice(0,a)+'  const { theme, setTheme } = useTheme();\n\n'+s.slice(b);
a=s.indexOf('  const toggleTheme =');b=s.indexOf('  // Hitung',a);s=s.slice(0,a)+s.slice(b);
a=s.indexOf('  return (');
s=s.slice(0,a)+`  return <div className="workspace-page max-w-6xl">
    <PageHeader title="Pengaturan" description="Sesuaikan ruang kerja, kelola asisten, dan simpan salinan data toko." />
    <nav className="workspace-tabs" aria-label="Bagian pengaturan"><a href="#appearance">Tampilan</a><a href="#account">Akun</a><a href="#ai">Asisten AI</a><a href="#backup">Data toko</a></nav>
    <section id="appearance" className="settings-section scroll-mt-20"><header><h2>Tampilan</h2><p>Pilih suasana yang nyaman untuk bekerja. Pilihan tersimpan di perangkat ini.</p></header><div className="grid max-w-lg grid-cols-2 gap-4"><button aria-pressed={theme==="light"} onClick={()=>setTheme("light")} className="theme-choice"><span className="theme-preview" aria-hidden="true"><i /><i /></span><span className="flex items-center gap-2"><Sun size={16} />Terang {theme==="light" && <Check size={15} />}</span></button><button aria-pressed={theme==="dark"} onClick={()=>setTheme("dark")} className="theme-choice"><span className="theme-preview theme-preview-dark" aria-hidden="true"><i /><i /></span><span className="flex items-center gap-2"><Moon size={16} />Gelap {theme==="dark" && <Check size={15} />}</span></button></div></section>
    <section id="account" className="settings-section scroll-mt-20"><header><h2>Akun</h2><p>Informasi akun yang digunakan untuk mengelola toko.</p></header><div className="min-w-0"><div className="flex flex-wrap items-center gap-4"><div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 font-serif text-2xl text-primary">{user?.name?.charAt(0)}</div><div className="min-w-0"><p className="text-sm font-semibold">{user?.name}</p><p className="mt-1 break-all text-xs text-muted-foreground">{user?.email}</p><p className="mt-1 text-xs text-muted-foreground">{user?.role==="admin"?"Administrator":"Staf toko"}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/profile" className="workspace-button">Lihat profil <ArrowUpRight size={15} /></Link><button onClick={()=>void logout()} className="workspace-button">Keluar</button></div></div></section>
    <section id="ai" className="settings-section scroll-mt-20"><header><h2>Asisten AI</h2><p>Atur koneksi dan model yang membantu pekerjaan harian toko.</p></header><div className="min-w-0"><AiSettingsCard isAdmin={user?.role==="admin"} /></div></section>
    <section id="backup" className="settings-section scroll-mt-20"><header><h2>Data toko</h2><p>Unduh salinan kategori, produk, pesanan, pelanggan, dan pergerakan stok.</p></header><div className="min-w-0"><div className="flex items-start gap-3"><FileJson size={24} className="mt-1 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">Cadangan data operasional</h3><p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">Tersimpan sebagai satu file JSON di perangkat Anda. Berisi data dari {EXPORT_TABLES.length} tabel operasional.</p></div></div><button onClick={()=>void downloadJson()} disabled={downloading} className="workspace-button workspace-button-primary mt-5">{downloading?<Loader2 size={16} className="animate-spin" />:<Download size={16} />}{downloading?"Menyiapkan unduhan…":"Unduh data JSON"}</button>
      {lastDownloadAt && !error && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-primary"><Check size={14} />Berhasil diunduh {lastDownloadAt}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} Silakan coba unduh kembali.</p>}
      {counts && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 text-xs font-semibold">Isi cadangan terakhir</h3><dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{EXPORT_TABLES.map(table=><div key={table} className="flex items-center justify-between gap-3 text-xs"><dt className="text-muted-foreground">{table}</dt><dd className="tabular-nums">{counts[table]<0?"Tidak tersedia":counts[table]}</dd></div>)}</dl></div>}
    </div></section>
  </div>;
}
`;
write(p,s);
p='src/components/settings/ai-settings-card.tsx';s=read(p);
s=s.replaceAll('className="rounded-xl border border-border bg-background p-4"','className="ai-settings min-w-0"');
s=s.replace('className="mb-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-3"','className="mb-5 border-l-2 border-primary bg-primary/5 px-4 py-3"');
s=s.replace('className="space-y-2"','className="divide-y divide-border border-y border-border"');
s=s.replace('className="rounded-lg border border-border/60 p-3 transition-colors hover:border-border"','className="min-w-0 py-5"');
s=s.replace('      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">\n        AI agent di halaman <span className="font-medium">AI Assistant</span> memakai model\n        eksternal (OpenAI-compatible) melalui gateway yang Anda atur di sini. API key\n        tersimpan di server dan hanya admin yang dapat mengaksesnya.\n      </p>', '      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">Pilih provider dan model untuk asisten toko. Kunci API tersimpan di server.</p>');
write(p,s);

p='src/app/(app)/sales/orders/[id]/page.tsx';s=read(p);
s=s.replace('import { CategoryName }','import { PanelHeading, OrderStatus } from "@/components/workspace";\nimport { CategoryName }');
s=s.replaceAll('className="p-4 lg:p-6"','className="workspace-page"');
a=s.indexOf('  const statusColor:');b=s.indexOf('  return (',a);s=s.slice(0,a)+s.slice(b);
// Keep every existing action, consolidate it into one clearly labeled disclosure.
s=s.replace('          <div className="flex flex-wrap gap-2">','          <details className="order-detail-actions"><summary className="workspace-button">Tindakan pesanan</summary><div className="flex flex-wrap gap-2 py-3">');
s=s.replace('          </div>\n        }\n      />','          </div></details>\n        }\n      />');
a=s.indexOf('      {/* Status */}');b=s.indexOf('      {/* Items */}',a);
s=s.slice(0,a)+`      <div className="my-5 flex flex-wrap items-center gap-3"><OrderStatus status={order.status} />{order.archived && <span className="text-xs text-muted-foreground">Diarsipkan</span>}<span className="text-xs text-muted-foreground">{order.items.reduce((sum,item)=>sum+item.quantity,0)} buku · {order.items.length} judul</span></div>
      {order.status!=="CANCELLED" && <ol aria-label="Tahap pesanan" className="mb-6 grid grid-cols-3 gap-2">{["DRAFT","CHECKED_OUT","COMPLETED"].map((status,i)=>{const current=["DRAFT","CHECKED_OUT","COMPLETED"].indexOf(order.status);return <li key={status} aria-current={current===i?"step":undefined} className={"border-t-2 pt-3 text-xs "+(i<=current?"border-primary text-primary":"border-border text-muted-foreground")}><span className="mr-2 font-mono">0{i+1}</span>{["Draft","Diproses","Selesai"][i]}</li>;})}</ol>}
      <div className="detail-grid">
`+s.slice(b);
s=s.replace('      <div className="mt-4 rounded-xl border border-border bg-background">','      <section className="workspace-panel"><PanelHeading title="Rincian buku" description="Harga dan jumlah pada saat pesanan dibuat." />');
const totals=s.indexOf('      {/* Totals */}');
s=s.slice(0,totals).replace(/      <\/div>\n\n$/,'      </section>\n\n')+s.slice(totals);
a=s.indexOf('      {/* Totals */}');b=s.indexOf('      {/* Surat Jalan */}',a);
s=s.slice(0,a)+`      <aside className="detail-summary"><p className="text-xs text-muted-foreground">Total pesanan</p><p className="mt-2 break-words font-serif text-3xl">{formatRupiah(order.total)}</p><dl className="mt-5"><div><dt>Pelanggan</dt><dd>{order.customerName}</dd></div><div><dt>Tanggal pesanan</dt><dd>{order.date}</dd></div><div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="!mt-0">{formatRupiah(order.subtotal)}</dd></div><div className="flex justify-between gap-3"><dt>Diskon</dt><dd className="!mt-0 text-destructive">−{formatRupiah(order.discount)}</dd></div></dl>
        {(order.status==="CHECKED_OUT" || order.status==="COMPLETED") && <button onClick={()=>printThermalNota(order)} className="workspace-button mt-5 w-full"><Printer size={16} />Cetak nota</button>}
        {order.status==="DRAFT" && <button onClick={()=>setProcessOpen(true)} className="workspace-button workspace-button-primary mt-5 w-full"><ShoppingCart size={16} />Proses pesanan</button>}
        {order.status==="CHECKED_OUT" && <button onClick={()=>setCompleteOpen(true)} className="workspace-button workspace-button-primary mt-3 w-full"><CheckCircle2 size={16} />Tandai selesai</button>}
      </aside>
      </div>

`+s.slice(b);
s=s.replaceAll('className="mt-5 rounded-xl border border-border bg-background p-4"','className="workspace-panel mt-5 p-5"');
s=s.replace('className="mb-3 flex items-center justify-between"','className="mb-5 flex flex-wrap items-center justify-between gap-3"');
s=s.replace('className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]"','className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3"');
s=s.replace('className="col-span-2"','className="sm:col-span-2"');
write(p,s);
