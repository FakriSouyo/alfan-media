import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const write=(p,s)=>fs.writeFileSync(p,s);
let p='src/app/(app)/stock/products/new/page.tsx',s=read(p);
s=s.replace('import { Plus, Trash2, Tags, Banknote }','import { Link } from "@/lib/navigation";\nimport { formatRupiah } from "@/lib/currency";\nimport { Plus, Trash2, Tags, ArrowLeft, Save }');
s=s.replace('  const [errors,','  const [saving,setSaving] = useState(false);\n  const [errors,');
s=s.replace('const handleSubmit = () => {','const handleSubmit = async () => {');
s=s.replace('    addProduct({','    setSaving(true);\n    const saved = await addProduct({');
s=s.replace('    router.push("/stock/products");','    setSaving(false);\n    if (!saved) { setErrors({save:"Le produit"}); return; }\n    router.push("/stock/products");').replace('Le produit','Produk belum berhasil disimpan. Periksa koneksi lalu coba lagi.');
const a=s.indexOf('  const inputClass =');
s=s.slice(0,a)+`  const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const defaultPrice = prices.find(p=>p.isDefault)?.price ?? 0;
  return <div className="workspace-page">
    <Link href="/stock/products" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={15} />Kembali ke katalog</Link>
    <PageHeader title="Tambah buku" description="Lengkapi identitas, persediaan, dan harga buku. Tanda * wajib diisi." />
    <div className="form-workspace">
      <div className="workspace-panel">
        <section className="form-section">
          <h2 className="form-section-title"><span>01</span>Identitas buku</h2>
          <div className="grid gap-5">
            <Field id="product-name" label="Nama buku *" error={errors.name} hint="Sertakan kelas, penerbit, atau edisi agar buku mudah dibedakan."><input id="product-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Matematika Kelas X — Kurikulum Merdeka" className={inputClass} aria-invalid={!!errors.name} aria-describedby={errors.name ? "product-name-error" : undefined} /></Field>
            <div className="grid gap-5 sm:grid-cols-2"><Field id="product-category" label="Kategori *" error={errors.categoryId}><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger id="product-category" aria-label="Kategori buku" icon={Tags} placeholder="Pilih kategori" className="w-full" error={errors.categoryId} /><SelectContent>{categories.map((c,i)=><SelectItem key={c.id} index={i} value={c.id}><CategoryName c={c} /></SelectItem>)}</SelectContent></Select></Field><Field id="product-barcode" label="Barcode" error={errors.barcode} hint="Opsional, jika buku memiliki barcode."><input id="product-barcode" value={barcode} onChange={e=>setBarcode(e.target.value)} autoComplete="off" placeholder="Nomor barcode" className={inputClass} /></Field></div>
            <div className="grid grid-cols-2 gap-5"><Field id="product-year" label="Tahun terbit *" error={errors.publishedYear}><input id="product-year" type="number" value={publishedYear} onChange={e=>setPublishedYear(parseInt(e.target.value)||0)} className={inputClass} /></Field><Field id="product-semester" label="Semester *"><Select value={semester} onValueChange={v=>setSemester(v as "Ganjil"|"Genap")}><SelectTrigger id="product-semester" aria-label="Semester buku" className="w-full" /><SelectContent><SelectItem index={0} value="Ganjil">Ganjil</SelectItem><SelectItem index={1} value="Genap">Genap</SelectItem></SelectContent></Select></Field></div>
            <Field id="product-description" label="Deskripsi buku *" error={errors.description}><textarea id="product-description" value={description} onChange={e=>setDescription(e.target.value)} rows={4} placeholder="Kurikulum, penerbit, materi, atau catatan lainnya…" className={inputClass} /></Field>
          </div>
        </section>
        <section className="form-section"><h2 className="form-section-title"><span>02</span>Persediaan & modal</h2><div className="grid gap-5 sm:grid-cols-2"><Field id="product-stock" label="Stok awal *" error={errors.stock} hint="Jumlah buku yang tersedia saat ini."><input id="product-stock" type="number" min={0} value={stock} onChange={e=>setStock(parseInt(e.target.value)||0)} className={inputClass} /></Field><Field id="product-cost" label="Modal per buku (Rp) *" error={errors.costPrice} hint="Biaya pembelian satu buku."><input id="product-cost" type="number" min={0} value={costPrice||""} onChange={e=>setCostPrice(parseInt(e.target.value)||0)} placeholder="0" className={inputClass} /></Field></div></section>
        <section className="form-section"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="form-section-title !mb-0"><span>03</span>Harga jual</h2><button type="button" onClick={addTier} className="workspace-button"><Plus size={15} />Tambah harga</button></div><p className="my-3 text-xs leading-relaxed text-muted-foreground">Gunakan beberapa harga untuk eceran, grosir, atau pelanggan khusus. Pilih satu harga utama.</p>
          {errors.prices && <p role="alert" className="mb-3 text-xs text-destructive">{errors.prices}</p>}
          <div className="divide-y divide-border">{prices.map((tier,i)=><div key={i} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field id={"tier-name-"+i} label="Nama harga"><input id={"tier-name-"+i} value={tier.tierName} onChange={e=>updateTier(i,{tierName:e.target.value})} placeholder="Contoh: Grosir" className={inputClass} /></Field>
            <Field id={"tier-price-"+i} label="Harga (Rp)"><input id={"tier-price-"+i} type="number" min={0} value={tier.price||""} onChange={e=>updateTier(i,{price:parseInt(e.target.value)||0})} placeholder="0" className={inputClass} /></Field>
            <div className="flex items-end gap-1"><button type="button" onClick={()=>setDefault(i)} aria-pressed={tier.isDefault} className={"workspace-button "+(tier.isDefault?"bg-accent text-primary":"")}>{tier.isDefault?"Harga utama":"Jadikan utama"}</button>{prices.length>1 && <button type="button" aria-label={"Hapus harga "+(tier.tierName||i+1)} onClick={()=>removeTier(i)} className="workspace-icon hover:text-destructive"><Trash2 size={16} /></button>}</div>
          </div>)}</div>
        </section>
        {errors.save && <p role="alert" className="px-5 pb-4 text-sm text-destructive">{errors.save}</p>}
        <div className="form-actions"><button onClick={()=>router.push("/stock/products")} className="workspace-button">Batal</button><button onClick={()=>void handleSubmit()} disabled={saving} className="workspace-button workspace-button-primary"><Save size={16} />{saving?"Menyimpan…":"Simpan buku"}</button></div>
      </div>
      <aside className="form-aside space-y-5"><section className="workspace-panel p-5"><h2 className="mb-4 text-sm font-semibold">Sampul buku</h2><div className="book-cover-upload"><ProductImageUpload value={imagePath||undefined} onChange={setImagePath} /></div></section><section className="border-l-2 border-primary pl-4"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ringkasan harga</p><p className="mt-2 font-serif text-2xl">{formatRupiah(defaultPrice)}</p><p className="mt-2 text-xs text-muted-foreground">Laba per buku <span className={defaultPrice-costPrice<0?"text-destructive":"text-primary"}>{formatRupiah(defaultPrice-costPrice)}</span></p></section></aside>
    </div>
  </div>;
}

function Field({id,label,error,hint,children}:{id:string;label:string;error?:string;hint?:string;children:React.ReactNode}) {
  return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-xs font-medium">{label}</label>{children}{error?<p id={id+"-error"} role="alert" className="mt-2 text-xs leading-relaxed text-destructive">{error}</p>:hint?<p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>:null}</div>;
}
`;
write(p,s);

p='src/app/(app)/stock/products/[id]/page.tsx';s=read(p);
s=s.replace('import { ProductImageUpload }','import { Metrics } from "@/components/workspace";\nimport { ProductImageUpload, productImageUrl }');
s=s.replace('TrendingUp }','TrendingUp, ImageIcon }');
s=s.replaceAll('className="p-4 lg:p-6"','className="workspace-page"');
s=s.replace('className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]"','className="product-detail-layout"');
s=s.replace('        {/* Details */}\n        <div className="rounded-xl border border-border bg-background p-4">','        {/* Details */}\n        <div className="workspace-panel product-information p-5">\n          <h2 className="mb-5 font-serif text-2xl">Informations du livre</h2>'.replace('Informations du livre','Informasi buku'));
s=s.replace('          <div className="mb-3">\n            <label className="mb-1 block text-[12px] font-medium text-foreground">Gambar Sampul</label>\n            <ProductImageUpload value={editing ? (imagePath || undefined) : (product.imagePath || undefined)} onChange={setImagePath} />\n          </div>',`          <div className="mb-6">
            {editing ? <ProductImageUpload value={imagePath||undefined} onChange={setImagePath} /> : <div className="flex flex-wrap items-start gap-5"><div className="flex h-48 w-36 shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-3">{product.imagePath ? <img src={productImageUrl(product.imagePath)??undefined} alt={"Sampul "+product.name} className="h-full w-full object-contain" /> : <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto mb-2" size={28} /><span className="text-xs">Belum ada sampul</span></div>}</div><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Harga utama</p><p className="mt-2 font-serif text-3xl">{formatRupiah(product.prices.find(p=>p.isDefault)?.price??0)}</p><p className="mt-4 text-xs text-muted-foreground">{product.stock} buku tersedia</p></div></div>}
          </div>`);
s=s.replace('        {/* Pricing */}\n        <div className="rounded-xl border border-border bg-background p-4">','        {/* Pricing */}\n        <div className="workspace-panel product-pricing p-5">');
s=s.replace('        {/* Stock Adjustment */}\n        <div className="rounded-xl border border-border bg-background p-4">','        {/* Stock Adjustment */}\n        <div className="workspace-panel product-adjustment p-5">');
s=s.replace('          <div className="flex gap-2">\n            <input type="number" value={adjQty', '          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Gunakan angka positif untuk menambah dan negatif untuk mengurangi stok. Sertakan alasan perubahan.</p>\n          <div className="flex flex-wrap gap-2">\n            <input aria-label="Jumlah penyesuaian stok" type="number" value={adjQty');
s=s.replace('<input value={adjRef}', '<input aria-label="Catatan penyesuaian" value={adjRef}').replace('h-8 flex-1 rounded-lg','h-8 min-w-0 flex-1 rounded-lg').replace('>OK</button>','>Terapkan</button>');
s=s.replaceAll('className="rounded-xl border border-border bg-background p-4 lg:col-span-2"','className="workspace-panel p-5 md:col-span-2"');
s=s.replace('className="flex items-center gap-2">\n                {editing','className="flex flex-wrap items-center gap-2">\n                {editing');
s=s.replace('<input value={p.tierName}','<input aria-label={"Nama harga " + (i+1)} value={p.tierName}').replace('<input type="number" value={p.price','<input aria-label={"Nilai harga " + (i+1)} type="number" value={p.price');
s=s.replace('<button onClick={() => setDefault(i)}','<button aria-label={"Jadikan harga utama " + p.tierName} aria-pressed={p.isDefault} onClick={() => setDefault(i)}').replace('}>D</button>','}>Utama</button>').replace('<button onClick={() => removeTier(i)}','<button aria-label={"Hapus harga " + p.tierName} onClick={() => removeTier(i)}');
// Replace stacked summary boxes with a single typographic metric strip.
let start=s.indexOf('          <div className="mb-3 grid grid-cols-2');let end=s.indexOf('          <div className="overflow-x-auto rounded-lg',start);
s=s.slice(0,start)+`          <Metrics items={[{label:"Buku terjual",value:salesStats.terjual},{label:"Omzet bersih",value:formatRupiah(salesStats.omzet)},{label:"Modal terpakai",value:formatRupiah(salesStats.modal)},{label:"Laba penjualan",value:formatRupiah(salesStats.laba),tone:"accent"}]} />
`+s.slice(end);
s=s.replace(', TrendingUp,', ',');
s=s.replace('className="flex items-baseline justify-between"','className="grid gap-2 border-b border-border py-3 sm:grid-cols-[150px_minmax(0,1fr)]"').replace('<span className="font-medium text-foreground">{value}</span>','<span className="whitespace-pre-wrap break-words font-medium leading-relaxed text-foreground">{value || "Belum diisi"}</span>');
// Preserve existing save actions, improve their targets and primary hierarchy.
s=s.replaceAll('className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]"','className="workspace-button"').replace('className="flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50"','className="workspace-button workspace-button-primary"');
// Explicit accessible names for edit fields whose visual labels precede controls.
s=s.replace('<input value={name}', '<input aria-label="Nama produk" value={name}').replace('<SelectTrigger className="w-full" placeholder="Pilih kategori"','<SelectTrigger aria-label="Kategori produk" className="w-full" placeholder="Pilih kategori"').replace('              <input\n                value={barcode}', '              <input\n                aria-label="Barcode produk"\n                value={barcode}').replace('<textarea value={description}', '<textarea aria-label="Deskripsi produk" value={description}').replace('<input type="number" value={publishedYear}', '<input aria-label="Tahun terbit" type="number" value={publishedYear}').replace('<SelectTrigger className="w-full" />','<SelectTrigger aria-label="Semester" className="w-full" />').replace('<input type="number" value={costPrice', '<input aria-label="Modal per buku" type="number" value={costPrice').replace('<input type="number" value={product.stock}', '<input aria-label="Stok saat ini" type="number" value={product.stock}');
write(p,s);
