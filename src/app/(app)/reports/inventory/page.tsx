"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store-context";
import { PageHeader } from "@/components/page-header";
import { CategoryName, categoryText } from "@/components/category-label";
import { Metrics, ReportNav, PanelHeading, SearchField, EmptyPanel } from "@/components/workspace";
import { Link } from "@/lib/navigation";
import { Download, ArrowUpRight } from "lucide-react";
import { businessDate } from "@/lib/business-date";
import { csvCell, escapeHtml } from "@/lib/sales-report";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function InventoryReportPage() {
  const { products, categories, movements } = useStore();
  const [search,setSearch] = useState("");
  const [onlyLow,setOnlyLow] = useState(false);
  const [catFilter, setCatFilter] = useState("all");

  const filteredProducts = useMemo(() => {
    return products.filter((p) => catFilter === "all" || p.categoryId === catFilter);
  }, [products, catFilter]);

  const productStats = useMemo(() => {
    const byProduct = new Map<string, { stockIn: number; stockOut: number }>();
    for (const movement of movements) {
      const totals = byProduct.get(movement.productId) ?? { stockIn: 0, stockOut: 0 };
      if (movement.quantity > 0) totals.stockIn += movement.quantity;
      else totals.stockOut += Math.abs(movement.quantity);
      byProduct.set(movement.productId, totals);
    }
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    return filteredProducts.map((p) => {
      const { stockIn = 0, stockOut = 0 } = byProduct.get(p.id) ?? {};
      return { ...p, catName: categoryText(categoriesById.get(p.categoryId)), stockIn, stockOut };
    });
  }, [filteredProducts, movements, categories]);

  const lowStock = productStats.filter((p) => p.stock <= 5);

  const visibleProducts = productStats.filter(p => (!onlyLow || p.stock <= 5) && (p.name.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")) || p.barcode.includes(search)));

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
      <p style="text-align:center;font-size:11px;color:#666">Dicetak: ${businessDate()}</p>
      <table><thead><tr><th>Produk</th><th>Kategori</th><th style="text-align:right">Masuk</th><th style="text-align:right">Keluar</th><th style="text-align:right">Stok</th></tr></thead><tbody>
      ${productStats.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.catName)}</td><td style="text-align:right">${p.stockIn}</td><td style="text-align:right">${p.stockOut}</td><td style="text-align:right;${p.stock <= 5 ? "color:red;font-weight:bold" : ""}">${p.stock}</td></tr>`).join("")}
      </tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const handleExportExcel = () => {
    const headers = ["Produk", "Kategori", "Barcode", "Stok Masuk", "Stok Keluar", "Stok Saat Ini"];
    const rows = productStats.map((p) => [p.name, p.catName, p.barcode, p.stockIn, p.stockOut, p.stock]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-inventaris.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="workspace-page">
      <PageHeader
        title="Laporan Inventaris"
        description="Status stok dan pergerakan inventaris."
        actions={
          <div className="flex gap-2">
            <button onClick={handleExportPDF} className="workspace-button">
              <Download size={14} /> PDF
            </button>
            <button onClick={handleExportExcel} className="workspace-button">
              <Download size={14} /> CSV
            </button>
          </div>
        }
      />

      <ReportNav active="inventory" />
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
      {/* Table */}
      <div>
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
              {visibleProducts.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-3 py-2">
                    <Link href={"/stock/products/"+p.id} className="font-medium text-foreground hover:underline">{p.name}</Link><p className="mt-1 font-mono text-[11px] text-muted-foreground">{p.barcode || "Tanpa barcode"}</p>
                    <div className="text-[11px] text-muted-foreground md:hidden">{p.catName}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.catName}</td>
                  <td className="px-3 py-2 text-right text-primary">{p.stockIn}</td>
                  <td className="px-3 py-2 text-right text-destructive">{p.stockOut}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={p.stock <= 5 ? "font-semibold text-destructive" : "text-foreground font-medium"}>{p.stock}</span>
                  </td>
                </tr>
              ))}
              {!visibleProducts.length && <tr><td colSpan={5}><EmptyPanel title="Tidak ada buku yang cocok" description="Coba kategori lain atau reset pencarian dan filter stok."><button className="workspace-button" onClick={()=>{setSearch("");setOnlyLow(false);setCatFilter("all");}}>Reset filter</button></EmptyPanel></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </section>
      <p className="mt-3 text-xs text-muted-foreground">Ekspor mencakup seluruh produk dalam kategori terpilih.</p>
    </div>
  );
}
