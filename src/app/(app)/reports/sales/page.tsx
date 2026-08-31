"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store-context";
import { formatRupiah, formatNumber } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Download } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function SalesReportPage() {
  const { orders, products } = useStore();
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const completedOrders = orders.filter((o) => o.status === "COMPLETED");

  const filtered = useMemo(() => {
    if (period === "daily") {
      return completedOrders.filter((o) => o.date === date);
    }
    return completedOrders.filter((o) => o.date.startsWith(month));
  }, [completedOrders, period, date, month]);

  const totalRevenue = filtered.reduce((s, o) => s + o.total, 0);
  const totalTransactions = filtered.length;
  const totalItems = filtered.reduce((s, o) => s + o.items.reduce((si, it) => si + it.quantity, 0), 0);
  const totalDiscount = filtered.reduce((s, o) => s + o.discount, 0);
  const avgOrder = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

  // Top selling products
  const productSales = new Map<string, { name: string; qty: number }>();
  for (const o of filtered) {
    for (const it of o.items) {
      const existing = productSales.get(it.productId);
      if (existing) existing.qty += it.quantity;
      else productSales.set(it.productId, { name: it.productName, qty: it.quantity });
    }
  }
  const topProducts = [...productSales.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  const handleExportPDF = () => {
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    const periodLabel = period === "daily" ? date : month;
    w.document.write(`<!DOCTYPE html><html><head><title>Laporan Penjualan</title>
      <style>
        body{font-family:'Segoe UI',sans-serif;font-size:12px;margin:20px;color:#333}
        h2{text-align:center;margin:0 0 4px}h3{margin:12px 0 6px;font-size:13px}
        table{width:100%;border-collapse:collapse;margin:4px 0}th,td{padding:3px 6px;text-align:left;border-bottom:1px solid #ddd;font-size:11px}
        th{background:#f5f5f5}.summary div{display:flex;justify-content:space-between;padding:2px 0}
        @media print{body{margin:10px}}
      </style></head><body>
      <h2>LAPORAN PENJUALAN</h2>
      <p style="text-align:center;font-size:11px;color:#666">Periode: ${periodLabel} · Dicetak: ${new Date().toLocaleDateString("id-ID")}</p>
      <h3>Ringkasan</h3>
      <div class="summary">
        <div><span>Total Pendapatan</span><b>${formatRupiah(totalRevenue)}</b></div>
        <div><span>Jumlah Transaksi</span><b>${totalTransactions}</b></div>
        <div><span>Item Terjual</span><b>${totalItems}</b></div>
        <div><span>Total Diskon</span><b>${formatRupiah(totalDiscount)}</b></div>
        <div><span>Rata-rata per Transaksi</span><b>${formatRupiah(avgOrder)}</b></div>
      </div>
      <h3>Detail Penjualan</h3>
      <table><thead><tr><th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Items</th><th style="text-align:right">Total</th><th>Status</th></tr></thead><tbody>
      ${filtered.map((o) => `<tr><td>${o.id}</td><td>${o.date}</td><td>${o.customerName}</td><td>${o.items.length}</td><td style="text-align:right">${formatRupiah(o.total)}</td><td>${o.status}</td></tr>`).join("")}
      </tbody></table>
      ${topProducts.length > 0 ? `<h3>Produk Terlaris</h3><table><thead><tr><th>#</th><th>Produk</th><th style="text-align:right">Terjual</th></tr></thead><tbody>${topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td style="text-align:right">${p.qty}</td></tr>`).join("")}</tbody></table>` : ""}
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const handleExportExcel = () => {
    const periodLabel = period === "daily" ? date : month;
    const headers = ["Invoice", "Tanggal", "Pelanggan", "Items", "Subtotal", "Diskon", "Total", "Status"];
    const rows = filtered.map((o) => [o.id, o.date, o.customerName, o.items.length, o.subtotal, o.discount, o.total, o.status]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-penjualan-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Laporan Penjualan"
        description="Ringkasan penjualan harian dan bulanan."
        actions={
          <div className="flex gap-2">
            <button onClick={handleExportPDF} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
              <Download size={14} /> PDF
            </button>
            <button onClick={handleExportExcel} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04]">
              <Download size={14} /> Excel
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-foreground">Periode</label>
          <Select value={period} onValueChange={(v) => setPeriod(v as "daily" | "monthly")}>
            <SelectTrigger className="h-8 w-auto min-w-[128px]" placeholder="Pilih periode" />
            <SelectContent>
              <SelectItem index={0} value="daily">Harian</SelectItem>
              <SelectItem index={1} value="monthly">Bulanan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "daily" ? (
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[12px] font-medium text-foreground">Bulan</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total Pendapatan", value: formatRupiah(totalRevenue) },
          { label: "Transaksi", value: String(totalTransactions) },
          { label: "Item Terjual", value: String(totalItems) },
          { label: "Total Diskon", value: formatRupiah(totalDiscount) },
          { label: "Rata-rata", value: formatRupiah(avgOrder) },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-xl border border-border bg-background p-3">
            <div className="truncate text-[11px] text-muted-foreground">{s.label}</div>
            <div className="mt-1 min-w-0 truncate text-[15px] font-semibold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Detail Table */}
      <div className="mt-4 rounded-xl border border-border bg-background">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-[13px] font-semibold text-foreground">Detail Penjualan</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Tanggal</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Pelanggan</th>
                <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Items</th>
                <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Diskon</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{o.id}</div>
                    <div className="max-w-[170px] truncate text-[11px] text-muted-foreground md:hidden">
                      {o.date} · {o.customerName} · {o.items.length} item{o.discount > 0 ? ` · diskon ${formatRupiah(o.discount)}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{o.date}</td>
                  <td className="px-3 py-2 text-foreground hidden md:table-cell">{o.customerName}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{o.items.length}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{o.discount > 0 ? formatRupiah(o.discount) : "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{formatRupiah(o.total)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Tidak ada data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">Produk Terlaris</h3>
          {topProducts.map((p, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border/50 py-1.5 text-[13px] last:border-0">
              <span className="text-foreground">{i + 1}. {p.name}</span>
              <span className="font-medium text-foreground">{p.qty} terjual</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
