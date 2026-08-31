"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store-context";
import { formatNumber } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { Download } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function InventoryReportPage() {
  const { products, categories, movements } = useStore();
  const [catFilter, setCatFilter] = useState("all");

  const filteredProducts = useMemo(() => {
    return products.filter((p) => catFilter === "all" || p.categoryId === catFilter);
  }, [products, catFilter]);

  const productStats = useMemo(() => {
    return filteredProducts.map((p) => {
      const pMovements = movements.filter((m) => m.productId === p.id);
      const stockIn = pMovements.filter((m) => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
      const stockOut = pMovements.filter((m) => m.quantity < 0).reduce((s, m) => s + Math.abs(m.quantity), 0);
      const cat = categories.find((c) => c.id === p.categoryId);
      return { ...p, catName: categoryText(cat), stockIn, stockOut };
    });
  }, [filteredProducts, movements, categories]);

  const lowStock = productStats.filter((p) => p.stock <= 5);

  const handleExportPDF = () => {
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Laporan Inventaris</title>
      <style>
        body{font-family:'Segoe UI',sans-serif;font-size:12px;margin:20px;color:#333}
        h2{text-align:center;margin:0 0 4px}h3{margin:12px 0 6px;font-size:13px}
        table{width:100%;border-collapse:collapse;margin:4px 0}th,td{padding:3px 6px;text-align:left;border-bottom:1px solid #ddd;font-size:11px}
        th{background:#f5f5f5}
        @media print{body{margin:10px}}
      </style></head><body>
      <h2>LAPORAN INVENTARIS</h2>
      <p style="text-align:center;font-size:11px;color:#666">Dicetak: ${new Date().toLocaleDateString("id-ID")}</p>
      <table><thead><tr><th>Produk</th><th>Kategori</th><th style="text-align:right">Masuk</th><th style="text-align:right">Keluar</th><th style="text-align:right">Stok</th></tr></thead><tbody>
      ${productStats.map((p) => `<tr><td>${p.name}</td><td>${p.catName}</td><td style="text-align:right">${p.stockIn}</td><td style="text-align:right">${p.stockOut}</td><td style="text-align:right;${p.stock <= 5 ? "color:red;font-weight:bold" : ""}">${p.stock}</td></tr>`).join("")}
      </tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const handleExportExcel = () => {
    const headers = ["Produk", "Kategori", "Barcode", "Stok Masuk", "Stok Keluar", "Stok Saat Ini"];
    const rows = productStats.map((p) => [p.name, p.catName, p.barcode, p.stockIn, p.stockOut, p.stock]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-inventaris.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Laporan Inventaris"
        description="Status stok dan pergerakan inventaris."
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

      {/* Filter */}
      <div className="mt-4">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[168px]" placeholder="Semua Kategori" />
          <SelectContent>
            <SelectItem index={0} value="all">Semua Kategori</SelectItem>
            {categories.map((c, i) => (
              <SelectItem key={c.id} index={i + 1} value={c.id}><CategoryName c={c} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <h3 className="text-[13px] font-semibold text-amber-500">Stok Menipis ({lowStock.length} produk)</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <span key={p.id} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">{p.name} ({p.stock})</span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-3 rounded-xl border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Produk</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Kategori</th>
                <th className="px-3 py-2 font-medium text-right">Masuk</th>
                <th className="px-3 py-2 font-medium text-right">Keluar</th>
                <th className="px-3 py-2 font-medium text-right">Stok</th>
              </tr>
            </thead>
            <tbody>
              {productStats.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground md:hidden">{p.catName}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.catName}</td>
                  <td className="px-3 py-2 text-right text-emerald-500">{p.stockIn}</td>
                  <td className="px-3 py-2 text-right text-destructive">{p.stockOut}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={p.stock <= 5 ? "font-semibold text-destructive" : "text-foreground font-medium"}>{p.stock}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
