
import { useState } from "react";
import { Link } from "@/lib/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ArrowUpRight, MoreHorizontal, Plus, FileText, CheckCircle2, Printer, ShoppingCart, Archive, Trash2 } from "lucide-react";
import { printSuratJalan } from "@/lib/surat-jalan";
import { printThermalNota } from "@/lib/nota-thermal";
import { Metrics, PanelHeading, SearchField, EmptyPanel, OrderStatus } from "@/components/workspace";

export default function OrdersPage() {
  const { orders, completeOrder, checkoutOrder, archiveOrder, deleteOrder } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Arsip tersembunyi kecuali di-toggle eksplisit (datanya tetap utuh di DB).
  const filtered = sorted
    .filter((o) => showArchived || !o.archived)
    .filter((o) => {
      const matchSearch = o.id.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });

  const statusLabel: Record<string, string> = {
    COMPLETED: "Selesai",
    CHECKED_OUT: "Diproses",
    DRAFT: "Draft",
    CANCELLED: "Dibatalkan",
  };

  return (
    <div className="workspace-page">
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

      <ConfirmDialog
        open={completeTarget !== null}
        title="Tandai Pesanan Selesai"
        description={completeTarget ? `Tandai pesanan ${completeTarget} selesai? Setelah selesai, pesanan bersifat final (tidak dapat dibatalkan).` : ""}
        confirmLabel="Selesaikan"
        onConfirm={async () => {
          if (!completeTarget) return;
          const ok = await completeOrder(completeTarget);
          if (!ok) alert("Gagal menyelesaikan: stok produk tidak cukup. Tambah stok dulu.");
        }}
        onOpenChange={(o) => { if (!o) setCompleteTarget(null); }}
      />

      <ConfirmDialog
        open={checkoutTarget !== null}
        title="Proses Pesanan"
        description={checkoutTarget ? `Mulai proses pesanan ${checkoutTarget}? Stok produk akan dipotong sekarang.` : ""}
        confirmLabel="Proses"
        onConfirm={async () => {
          if (!checkoutTarget) return;
          const ok = await checkoutOrder(checkoutTarget);
          if (!ok) alert("Gagal memproses: stok produk tidak cukup. Tambah stok dulu.");
        }}
        onOpenChange={(o) => { if (!o) setCheckoutTarget(null); }}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Arsipkan Pesanan"
        description={archiveTarget ? `Pesanan ${archiveTarget} akan tersembunyi dari daftar. Data (stok & total penjualan) tetap utuh.` : ""}
        confirmLabel="Arsipkan"
        onConfirm={() => { if (archiveTarget) archiveOrder(archiveTarget, true); }}
        onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Pesanan"
        description={deleteTarget ? `Hapus permanen pesanan ${deleteTarget}? Semua item, surat jalan, dan pergerakan stok terkait akan ikut terhapus.` : ""}
        confirmLabel="Hapus Permanen"
        destructive
        onConfirm={async () => { if (deleteTarget) await deleteOrder(deleteTarget); }}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      />
    </div>
  );
}
