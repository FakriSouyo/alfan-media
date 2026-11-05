import { useParams } from "@/lib/navigation";

import { useState } from "react";
import { Link } from "@/lib/navigation";
import { useRouter } from "@/lib/navigation";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { PanelHeading, OrderStatus } from "@/components/workspace";
import { CategoryName } from "@/components/category-label";
import { ArrowLeft, Printer, XCircle, FileText, CheckCircle2, Edit3, ShoppingCart, Archive, Trash2 } from "lucide-react";
import { printSuratJalan } from "@/lib/surat-jalan";
import { printThermalNota } from "@/lib/nota-thermal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { SuratJalan } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { orders, products, categories, loading, cancelOrder, completeOrder, checkoutOrder, archiveOrder, deleteOrder, updateSuratJalan } = useStore();
  const order = orders.find((o) => o.id === id);
  const [sjOpen, setSjOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sjForm, setSjForm] = useState<SuratJalan>({
    no: "",
    tanggal: "",
    pengirim: "",
    penerima: "",
    estimasi: "",
    namaPengirim: "",
    kendaraan: "",
    catatan: "",
  });

  if (!order && loading) {
    return <div role="status" className="flex min-h-64 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" />Memuat rincian pesanan…</div>;
  }

  if (!order) {
    return (
      <div className="workspace-page">
        <p className="text-muted-foreground">Pesanan tidak ditemukan.</p>
        <Link href="/sales/orders" className="mt-2 text-[13px] text-foreground underline">Kembali</Link>
      </div>
    );
  }

  // Data surat jalan (default saat belum pernah diedit).
  const suratJalan: SuratJalan = {
    no: "SJ-" + order.id,
    tanggal: order.date,
    pengirim: "Alfan Media",
    penerima: order.customerName,
    estimasi: "",
    namaPengirim: "",
    kendaraan: "",
    catatan: "",
    ...(order.suratJalan ?? {}),
  };
  const openSJEdit = () => {
    setSjForm(suratJalan);
    setSjOpen(true);
  };
  const saveSJ = () => {
    updateSuratJalan(order.id, sjForm);
    setSjOpen(false);
  };

  return (
    <div className="workspace-page">
      <div className="mb-4">
        <Link href="/sales/orders" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader
        title={order.id}
        description={`${order.date} · ${order.customerName}`}
        actions={
          <details className="order-detail-actions"><summary className="workspace-button">Tindakan pesanan</summary><div className="flex flex-wrap gap-2 py-3">
            {order.status === "DRAFT" && (
              <button
                onClick={() => setProcessOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-blue-500/30 px-3 py-1.5 text-[13px] font-medium text-blue-500 hover:bg-blue-500/10"
              >
                <ShoppingCart size={14} /> Proses Pesanan
              </button>
            )}
            {order.status === "CHECKED_OUT" && (
              <button
                onClick={() => setCompleteOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-[13px] font-medium text-emerald-500 hover:bg-emerald-500/10"
              >
                <CheckCircle2 size={14} /> Tandai Selesai
              </button>
            )}
            {order.status === "COMPLETED" && !order.archived && (
              <button
                onClick={() => setArchiveOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]"
              >
                <Archive size={14} /> Arsipkan
              </button>
            )}
            {order.status === "COMPLETED" && order.archived && (
              <button
                onClick={() => archiveOrder(order.id, false)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]"
              >
                <Archive size={14} /> Pulihkan dari Arsip
              </button>
            )}
            {(order.status === "CHECKED_OUT" || order.status === "COMPLETED") && (
              <button onClick={() => printThermalNota(order)} title="Cetak receipt (thermal)" className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
                <Printer size={14} /> Nota
              </button>
            )}
            {(order.status === "CHECKED_OUT" || order.status === "COMPLETED") && (
              <>
                <button onClick={() => printSuratJalan(order)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
                  <FileText size={14} /> Surat Izin Jalan
                </button>
                <button onClick={openSJEdit} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
                  <Edit3 size={14} /> Edit Surat Jalan
                </button>
              </>
            )}
            {/* Batalkan hanya untuk CHECKED_OUT: COMPLETED bersifat final. */}
            {order.status === "CHECKED_OUT" && (
              <button onClick={() => setCancelOpen(true)} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10">
                <XCircle size={14} /> Batalkan
              </button>
            )}
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10">
              <Trash2 size={14} /> Hapus Pesanan
            </button>
          </div></details>
        }
      />

      <div className="my-5 flex flex-wrap items-center gap-3"><OrderStatus status={order.status} />{order.archived && <span className="text-xs text-muted-foreground">Diarsipkan</span>}<span className="text-xs text-muted-foreground">{order.items.reduce((sum,item)=>sum+item.quantity,0)} buku · {order.items.length} judul</span></div>
      {order.status!=="CANCELLED" && <ol aria-label="Tahap pesanan" className="mb-6 grid grid-cols-3 gap-2">{["DRAFT","CHECKED_OUT","COMPLETED"].map((status,i)=>{const current=["DRAFT","CHECKED_OUT","COMPLETED"].indexOf(order.status);return <li key={status} aria-current={current===i?"step":undefined} className={"border-t-2 pt-3 text-xs "+(i<=current?"border-primary text-primary":"border-border text-muted-foreground")}><span className="mr-2 font-mono">0{i+1}</span>{["Draft","Diproses","Selesai"][i]}</li>;})}</ol>}
      <div className="detail-grid">
      {/* Items */}
      <section className="workspace-panel"><PanelHeading title="Rincian buku" description="Harga dan jumlah pada saat pesanan dibuat." />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Tier</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Harga</th>
                <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Diskon</th>
                <th className="px-3 py-2 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => {
                const itProduct = products.find((p) => p.id === it.productId);
                const itCat = itProduct ? categories.find((c) => c.id === itProduct.categoryId) : undefined;
                return (
                <tr key={it.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{it.productName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {itCat && <CategoryName c={itCat} badgeClassName="bg-foreground/[0.07] text-[10px]" />}
                      <span className="font-mono">{it.productBarcode}</span>
                      <span className="md:hidden">{it.priceTier}{it.discountPercent > 0 ? ` · -${it.discountPercent}%` : ""}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{it.priceTier}</td>
                  <td className="px-3 py-2 text-right text-foreground">{it.quantity}</td>
                  <td className="px-3 py-2 text-right text-foreground">{formatRupiah(it.unitPrice)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{it.discountPercent > 0 ? `-${it.discountPercent}%` : "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatRupiah(it.subtotal)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="detail-summary"><p className="text-xs text-muted-foreground">Total pesanan</p><p className="mt-2 break-words font-serif text-3xl">{formatRupiah(order.total)}</p><dl className="mt-5"><div><dt>Pelanggan</dt><dd>{order.customerName}</dd></div><div><dt>Tanggal pesanan</dt><dd>{order.date}</dd></div><div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="!mt-0">{formatRupiah(order.subtotal)}</dd></div><div className="flex justify-between gap-3"><dt>Diskon</dt><dd className="!mt-0 text-destructive">−{formatRupiah(order.discount)}</dd></div></dl>
        {(order.status==="CHECKED_OUT" || order.status==="COMPLETED") && <button onClick={()=>printThermalNota(order)} className="workspace-button mt-5 w-full"><Printer size={16} />Cetak nota</button>}
        {order.status==="DRAFT" && <button onClick={()=>setProcessOpen(true)} className="workspace-button workspace-button-primary mt-5 w-full"><ShoppingCart size={16} />Proses pesanan</button>}
        {order.status==="CHECKED_OUT" && <button onClick={()=>setCompleteOpen(true)} className="workspace-button workspace-button-primary mt-3 w-full"><CheckCircle2 size={16} />Tandai selesai</button>}
      </aside>
      </div>

      {/* Surat Jalan */}
      {(order.status === "CHECKED_OUT" || order.status === "COMPLETED") && (
        <div className="workspace-panel mt-5 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-foreground">Surat Izin Jalan</h3>
            <div className="flex gap-2">
              <button onClick={openSJEdit} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[12px] text-foreground hover:bg-foreground/[0.04]">
                <Edit3 size={12} /> Edit
              </button>
              <button onClick={() => printSuratJalan(order)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[12px] text-foreground hover:bg-foreground/[0.04]">
                <FileText size={12} /> Cetak
              </button>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted-foreground">No</dt><dd className="font-medium text-foreground">{suratJalan.no}</dd></div>
            <div><dt className="text-muted-foreground">Tanggal Kirim</dt><dd className="text-foreground">{suratJalan.tanggal || "-"}</dd></div>
            <div><dt className="text-muted-foreground">Pengirim</dt><dd className="text-foreground">{suratJalan.pengirim || "-"}</dd></div>
            <div><dt className="text-muted-foreground">Penerima</dt><dd className="text-foreground">{suratJalan.penerima || "-"}</dd></div>
            {suratJalan.estimasi && <div><dt className="text-muted-foreground">Estimasi</dt><dd className="text-foreground">{suratJalan.estimasi}</dd></div>}
            {suratJalan.namaPengirim && <div><dt className="text-muted-foreground">Nama Pengirim</dt><dd className="text-foreground">{suratJalan.namaPengirim}</dd></div>}
            {suratJalan.kendaraan && <div><dt className="text-muted-foreground">No. Kendaraan</dt><dd className="text-foreground">{suratJalan.kendaraan}</dd></div>}
            {suratJalan.catatan && (
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Catatan</dt><dd className="text-foreground">{suratJalan.catatan}</dd></div>
            )}
          </dl>
        </div>
      )}

      {/* Revisions */}
      {order.revisions.length > 0 && (
        <div className="workspace-panel mt-5 p-5">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Riwayat Revisi</h3>
          {order.revisions.map((rev) => (
            <div key={rev.id} className="border-t border-border/50 pt-2 text-[12px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Revisi #{rev.revisionNumber} · {rev.changedAt.slice(0, 10)}</span>
                <span>{rev.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Surat Jalan dialog */}
      <Dialog open={sjOpen} onOpenChange={setSjOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit Surat Izin Jalan</DialogTitle>
            <DialogDescription>
              Ubah data surat jalan untuk {order.id}. Tersimpan per pesanan & dipakai saat mencetak.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">No Surat Jalan</label>
              <input value={sjForm.no} onChange={(e) => setSjForm({ ...sjForm, no: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Tanggal Kirim</label>
              <input type="date" value={sjForm.tanggal} onChange={(e) => setSjForm({ ...sjForm, tanggal: e.target.value })} className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Pengirim</label>
                <input value={sjForm.pengirim} onChange={(e) => setSjForm({ ...sjForm, pengirim: e.target.value })} placeholder="Alfan Media" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Penerima</label>
                <input value={sjForm.penerima} onChange={(e) => setSjForm({ ...sjForm, penerima: e.target.value })} placeholder="Nama penerima" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Estimasi Pengiriman <span className="text-muted-foreground/60">(opsional)</span></label>
              <input value={sjForm.estimasi} onChange={(e) => setSjForm({ ...sjForm, estimasi: e.target.value })} placeholder="cth: 2-3 hari kerja" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">Nama Pengirim <span className="text-muted-foreground/60">(opsional)</span></label>
                <input value={sjForm.namaPengirim} onChange={(e) => setSjForm({ ...sjForm, namaPengirim: e.target.value })} placeholder="Nama kurir/pengirim" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground">No. Kendaraan <span className="text-muted-foreground/60">(opsional)</span></label>
                <input value={sjForm.kendaraan} onChange={(e) => setSjForm({ ...sjForm, kendaraan: e.target.value })} placeholder="cth: B 1234 XYZ" className="h-8 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground">Catatan</label>
              <textarea value={sjForm.catatan} onChange={(e) => setSjForm({ ...sjForm, catatan: e.target.value })} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <button className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">Batal</button>
            </DialogClose>
            <button onClick={saveSJ} className="rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90">Simpan</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi proses draft (stok dipotong di sini) */}
      <ConfirmDialog
        open={processOpen}
        title="Proses Pesanan"
        description={`Mulai proses pesanan ${order.id}? Stok produk akan dipotong sekarang.`}
        confirmLabel="Proses"
        onConfirm={async () => {
          const ok = await checkoutOrder(order.id);
          if (!ok) alert("Gagal memproses: stok produk tidak cukup. Tambah stok dulu.");
        }}
        onOpenChange={setProcessOpen}
      />

      {/* Konfirmasi selesaikan pesanan */}
      <ConfirmDialog
        open={completeOpen}
        title="Tandai Pesanan Selesai"
        description={`Tandai pesanan ${order.id} selesai? Setelah selesai, pesanan bersifat final (tidak dapat dibatalkan).`}
        confirmLabel="Selesaikan"
        onConfirm={async () => {
          const ok = await completeOrder(order.id);
          if (!ok) alert("Gagal menyelesaikan: stok produk tidak cukup. Tambah stok dulu.");
        }}
        onOpenChange={setCompleteOpen}
      />

      {/* Konfirmasi arsipkan pesanan */}
      <ConfirmDialog
        open={archiveOpen}
        title="Arsipkan Pesanan"
        description={`Pesanan ${order.id} akan tersembunyi dari daftar. Data (stok & total penjualan) tetap utuh.`}
        confirmLabel="Arsipkan"
        onConfirm={() => archiveOrder(order.id, true)}
        onOpenChange={setArchiveOpen}
      />

      {/* Konfirmasi batalkan pesanan (hanya CHECKED_OUT) */}
      <ConfirmDialog
        open={cancelOpen}
        title="Batalkan Pesanan"
        description={`Batalkan pesanan ${order.id}? Stok yang sudah dipotong akan dikembalikan.`}
        confirmLabel="Batalkan Pesanan"
        destructive
        onConfirm={async () => {
          const ok = await cancelOrder(order.id);
          if (!ok) alert("Pesanan tidak dapat dibatalkan.");
        }}
        onOpenChange={setCancelOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Hapus Pesanan"
        description={`Hapus permanen pesanan ${order.id}? Semua item, surat jalan, dan pergerakan stok terkait akan ikut terhapus. Aksi ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Permanen"
        destructive
        onConfirm={async () => {
          const ok = await deleteOrder(order.id);
          if (ok) router.push("/sales/orders");
        }}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
