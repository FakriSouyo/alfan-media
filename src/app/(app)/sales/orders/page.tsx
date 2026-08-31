"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Eye, ListFilter, FileText, CheckCircle2, Printer } from "lucide-react";
import { printSuratJalan } from "@/lib/surat-jalan";
import { printThermalNota } from "@/lib/nota-thermal";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function OrdersPage() {
  const { orders, completeOrder } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [completeTarget, setCompleteTarget] = useState<string | null>(null);

  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filtered = sorted.filter((o) => {
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColor: Record<string, string> = {
    COMPLETED: "bg-emerald-500/15 text-emerald-500",
    CHECKED_OUT: "bg-blue-500/15 text-blue-500",
    DRAFT: "bg-muted text-muted-foreground",
    CANCELLED: "bg-destructive/15 text-destructive",
  };
  const statusLabel: Record<string, string> = {
    COMPLETED: "Selesai",
    CHECKED_OUT: "Diproses",
    DRAFT: "Draft",
    CANCELLED: "Dibatalkan",
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Pesanan" description="Daftar semua pesanan." />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Cari invoice atau pelanggan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger icon={ListFilter} className="h-8 w-auto min-w-[168px]" placeholder="Semua Status" />
          <SelectContent>
            <SelectItem index={0} value="all">Semua Status</SelectItem>
            <SelectItem index={1} value="COMPLETED">Selesai</SelectItem>
            <SelectItem index={2} value="CHECKED_OUT">Diproses</SelectItem>
            <SelectItem index={3} value="DRAFT">Draft</SelectItem>
            <SelectItem index={4} value="CANCELLED">Dibatalkan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Tanggal</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Pelanggan</th>
                <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Items</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{o.id}</div>
                    <div className="max-w-[160px] truncate text-[11px] text-muted-foreground md:hidden">{o.date} · {o.customerName}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{o.date}</td>
                  <td className="px-3 py-2 text-foreground hidden md:table-cell">{o.customerName}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{o.items.length}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatRupiah(o.total)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor[o.status]}`}>
                      {statusLabel[o.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {o.status === "CHECKED_OUT" && (
                        <button
                          onClick={() => setCompleteTarget(o.id)}
                          title="Tandai Selesai"
                          className="flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 size={12} /> <span className="hidden sm:inline">Selesai</span>
                        </button>
                      )}
                      {(o.status === "CHECKED_OUT" || o.status === "COMPLETED") && (
                        <button
                          onClick={() => printThermalNota(o)}
                          title="Cetak Receipt (thermal)"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Printer size={14} />
                        </button>
                      )}
                      {(o.status === "CHECKED_OUT" || o.status === "COMPLETED") && (
                        <button
                          onClick={() => printSuratJalan(o)}
                          title="Lihat Surat Izin Jalan"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <FileText size={14} />
                        </button>
                      )}
                      <Link href={`/sales/orders/${o.id}`} title="Detail" className="rounded p-1 text-muted-foreground hover:text-foreground"><Eye size={14} /></Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Tidak ada pesanan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={completeTarget !== null}
        title="Tandai Pesanan Selesai"
        description={completeTarget ? `Tandai pesanan ${completeTarget} selesai? Stok produk akan dikurangi.` : ""}
        confirmLabel="Selesaikan"
        onConfirm={async () => {
          if (!completeTarget) return;
          const ok = await completeOrder(completeTarget);
          if (!ok) alert("Gagal menyelesaikan: stok produk tidak cukup. Tambah stok dulu.");
        }}
        onOpenChange={(o) => { if (!o) setCompleteTarget(null); }}
      />
    </div>
  );
}
