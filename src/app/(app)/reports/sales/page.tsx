"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store-context";
import { formatRupiah, formatNumber } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { businessDate, businessMonth, formatSalesPeriod, resolveSalesPeriod, type SalesPeriod } from "@/lib/business-date";
import { buildSalesReport, escapeHtml, toCsv } from "@/lib/sales-report";

function amount(value: number) {
  return formatRupiah(value);
}

export default function SalesReportPage() {
  const { orders, loading } = useStore();
  const [period, setPeriod] = useState<SalesPeriod>(() => ({ mode: "daily", date: businessDate() }));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [bookSearch, setBookSearch] = useState("");

  const range = useMemo(() => resolveSalesPeriod(period), [period]);
  const report = useMemo(() => buildSalesReport(orders, range), [orders, range]);
  const visibleBooks = useMemo(() => {
    const query = bookSearch.trim().toLocaleLowerCase("id-ID");
    if (!query) return report.books;
    return report.books.filter((book) =>
      book.name.toLocaleLowerCase("id-ID").includes(query) ||
      book.barcode.toLocaleLowerCase("id-ID").includes(query) ||
      book.productId.toLocaleLowerCase("id-ID").includes(query)
    );
  }, [report.books, bookSearch]);
  const periodLabel = formatSalesPeriod(period);

  const setMode = (mode: SalesPeriod["mode"]) => {
    if (mode === "daily") setPeriod({ mode, date: businessDate() });
    else if (mode === "monthly") {
      const month = businessMonth();
      setPeriod({ mode, fromMonth: month, toMonth: month });
    } else setPeriod({ mode, fromDate: businessDate(), toDate: businessDate() });
  };

  const handleExportPDF = () => {
    if (range.error) return;
    const w = window.open("", "_blank", "width=1000,height=750");
    if (!w) return;
    const invoiceRows = report.invoices.map(({ order, lines, invoiceDiscount }) => {
      const itemRows = lines.map(({ item, lineDiscount, allocatedNet }) =>
        `<tr><td>${escapeHtml(item.productName)}<br><small>${escapeHtml(item.productBarcode || "Tanpa barcode")}</small></td><td style="text-align:right">${formatNumber(item.quantity)}</td><td style="text-align:right">${amount(item.unitPrice)}</td><td style="text-align:right">${item.discountPercent}% (${amount(lineDiscount)})</td><td style="text-align:right">${amount(item.subtotal)}</td><td style="text-align:right">${amount(allocatedNet)}</td></tr>`
      ).join("");
      return `<h4>${escapeHtml(order.id)} · ${escapeHtml(order.customerName)} · ${escapeHtml(order.date)} · ${escapeHtml(order.status)}</h4><table><thead><tr><th>Produk</th><th>Qty</th><th>Harga Satuan</th><th>Diskon Item</th><th>Subtotal Item</th><th>Alokasi Bersih</th></tr></thead><tbody>${itemRows}</tbody></table><p class="totals">Subtotal invoice: ${amount(order.subtotal)} · Diskon invoice: ${amount(order.discount)}${invoiceDiscount ? ` (diskon tingkat invoice ${amount(invoiceDiscount)})` : ""} · Total: <b>${amount(order.total)}</b></p>`;
    }).join("");
    const bookRows = report.books.map((book) => `<tr><td>${escapeHtml(book.name)}</td><td>${escapeHtml(book.barcode || book.productId || "Snapshot historis")}</td><td>${formatNumber(book.quantity)}</td><td>${formatNumber(book.transactions)}</td><td>${amount(book.gross)}</td><td>${amount(book.allocatedDiscount)}</td><td>${amount(book.netRevenue)}</td></tr>`).join("");
    const topRows = report.topProducts.map((book, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(book.name)}</td><td>${formatNumber(book.quantity)}</td><td>${amount(book.netRevenue)}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Laporan Penjualan</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#222}h2{text-align:center;margin:0}h3{margin:18px 0 7px;font-size:14px}h4{margin:14px 0 4px;font-size:12px}p{margin:4px 0 8px}.summary{display:flex;flex-wrap:wrap;gap:14px}.summary b{margin-left:5px}table{width:100%;border-collapse:collapse;margin:5px 0 10px}th,td{padding:4px 6px;text-align:left;border:1px solid #ccc;font-size:10px}th{background:#f2f2f2}.totals{text-align:right}.muted{color:#555}@media print{body{margin:10mm}}
      </style></head><body><h2>LAPORAN PENJUALAN</h2><p class="muted" style="text-align:center">Periode: ${escapeHtml(periodLabel)} · Zona waktu: Asia/Makassar</p>
      <h3>Ringkasan</h3><div class="summary"><span>Pendapatan <b>${amount(report.totalRevenue)}</b></span><span>Transaksi <b>${report.totalTransactions}</b></span><span>Item terjual <b>${formatNumber(report.totalItems)}</b></span><span>Diskon <b>${amount(report.totalDiscount)}</b></span><span>Rata-rata <b>${amount(report.averageOrder)}</b></span></div>
      <h3>Detail Penjualan per Invoice</h3>${invoiceRows || "<p>Tidak ada transaksi pada periode ini.</p>"}
      <h3>Rekap Penjualan per Buku</h3><table><thead><tr><th>Buku</th><th>Barcode / ID</th><th>Qty</th><th>Transaksi</th><th>Penjualan Kotor</th><th>Alokasi Diskon</th><th>Pendapatan Bersih</th></tr></thead><tbody>${bookRows || '<tr><td colspan="7">Tidak ada data.</td></tr>'}</tbody></table>
      <h3>Produk Terlaris (5 teratas)</h3><table><thead><tr><th>#</th><th>Produk</th><th>Qty</th><th>Pendapatan Bersih</th></tr></thead><tbody>${topRows || '<tr><td colspan="4">Tidak ada data.</td></tr>'}</tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const handleExportCsv = () => {
    if (range.error) return;
    const rows: (string | number)[][] = [
      ["Laporan Penjualan", "Periode", periodLabel, "Zona waktu", "Asia/Makassar"],
      [],
      ["Ringkasan"],
      ["Total Pendapatan", report.totalRevenue],
      ["Jumlah Transaksi", report.totalTransactions],
      ["Item Terjual", report.totalItems],
      ["Total Diskon", report.totalDiscount],
      ["Rata-rata per Transaksi", report.averageOrder],
      [],
      ["Detail Penjualan per Invoice"],
      ["Invoice", "Tanggal", "Pelanggan", "Status", "Produk", "Barcode", "Qty", "Harga Satuan", "Diskon Item %", "Diskon Item", "Subtotal Item", "Diskon Invoice", "Net Item Teralokasi", "Subtotal Invoice", "Diskon Invoice Total", "Total Invoice"],
    ];
    for (const { order, lines, invoiceDiscount } of report.invoices) {
      for (const { item, lineDiscount, allocatedNet } of lines) {
        rows.push([order.id, order.date, order.customerName, order.status, item.productName, item.productBarcode, item.quantity, item.unitPrice, item.discountPercent, lineDiscount, item.subtotal, invoiceDiscount, allocatedNet, order.subtotal, order.discount, order.total]);
      }
    }
    rows.push([], ["Rekap Penjualan per Buku"], ["Buku", "Barcode", "Product ID", "Qty Terjual", "Jumlah Transaksi", "Penjualan Kotor", "Alokasi Diskon", "Pendapatan Bersih"]);
    for (const book of report.books) rows.push([book.name, book.barcode, book.productId, book.quantity, book.transactions, book.gross, book.allocatedDiscount, book.netRevenue]);
    rows.push([], ["Produk Terlaris (5 teratas)"], ["Peringkat", "Produk", "Qty Terjual", "Pendapatan Bersih"]);
    report.topProducts.forEach((book, index) => rows.push([index + 1, book.name, book.quantity, book.netRevenue]));

    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-penjualan-${range.start}-${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Laporan Penjualan"
        description="Ringkasan transaksi dan produk terjual pada periode yang dipilih."
        actions={<div className="flex gap-2">
          <button onClick={handleExportPDF} disabled={Boolean(range.error) || loading} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"><Download size={14} /> PDF</button>
          <button onClick={handleExportCsv} disabled={Boolean(range.error) || loading} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"><Download size={14} /> CSV</button>
        </div>}
      />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-foreground">Periode</label>
          <Select value={period.mode} onValueChange={(value) => setMode(value as SalesPeriod["mode"])}>
            <SelectTrigger className="h-8 w-auto min-w-[150px]" placeholder="Pilih periode" />
            <SelectContent>
              <SelectItem index={0} value="daily">Harian</SelectItem>
              <SelectItem index={1} value="monthly">Rentang bulanan</SelectItem>
              <SelectItem index={2} value="custom">Rentang tanggal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period.mode === "daily" && <label className="text-[12px] font-medium text-foreground">Tanggal<input aria-label="Tanggal laporan" type="date" value={period.date} onChange={(e) => setPeriod({ ...period, date: e.target.value })} className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-[13px]" /></label>}
        {period.mode === "monthly" && <>
          <label className="text-[12px] font-medium text-foreground">Bulan awal<input aria-label="Bulan awal" type="month" value={period.fromMonth} onChange={(e) => setPeriod({ ...period, fromMonth: e.target.value })} className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-[13px]" /></label>
          <label className="text-[12px] font-medium text-foreground">Bulan akhir<input aria-label="Bulan akhir" type="month" value={period.toMonth} onChange={(e) => setPeriod({ ...period, toMonth: e.target.value })} className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-[13px]" /></label>
        </>}
        {period.mode === "custom" && <>
          <label className="text-[12px] font-medium text-foreground">Tanggal awal<input aria-label="Tanggal awal" type="date" value={period.fromDate} onChange={(e) => setPeriod({ ...period, fromDate: e.target.value })} className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-[13px]" /></label>
          <label className="text-[12px] font-medium text-foreground">Tanggal akhir<input aria-label="Tanggal akhir" type="date" value={period.toDate} onChange={(e) => setPeriod({ ...period, toDate: e.target.value })} className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-[13px]" /></label>
        </>}
        <span className="pb-1 text-[12px] text-muted-foreground">Periode laporan: {periodLabel}</span>
      </div>
      {range.error && <p role="alert" className="mt-2 text-[12px] text-destructive">{range.error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total Pendapatan", value: amount(report.totalRevenue) },
          { label: "Transaksi", value: String(report.totalTransactions) },
          { label: "Item Terjual", value: formatNumber(report.totalItems) },
          { label: "Total Diskon", value: amount(report.totalDiscount) },
          { label: "Rata-rata", value: amount(report.averageOrder) },
        ].map((summary) => <div key={summary.label} className="min-w-0 rounded-xl border border-border bg-background p-3"><div className="truncate text-[11px] text-muted-foreground">{summary.label}</div><div className="mt-1 truncate text-[15px] font-semibold text-foreground">{summary.value}</div></div>)}
      </div>

      <section className="mt-4 rounded-xl border border-border bg-background">
        <div className="border-b border-border px-4 py-2.5"><h3 className="text-[13px] font-semibold text-foreground">Detail Penjualan per Invoice</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b border-border text-left text-[12px] text-muted-foreground"><th className="px-3 py-2 font-medium">Invoice</th><th className="hidden px-3 py-2 font-medium md:table-cell">Tanggal</th><th className="hidden px-3 py-2 font-medium md:table-cell">Pelanggan</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">Items</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">Diskon</th><th className="px-3 py-2 text-right font-medium">Total</th></tr></thead>
          <tbody>{report.invoices.map(({ order, lines, invoiceDiscount }) => {
            const isOpen = Boolean(expanded[order.id]);
            const panelId = `invoice-items-${order.id}`;
            return <InvoiceRows key={order.id} order={order} lines={lines} invoiceDiscount={invoiceDiscount} isOpen={isOpen} panelId={panelId} onToggle={() => setExpanded((current) => ({ ...current, [order.id]: !current[order.id] }))} />;
          })}
          {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Memuat laporan…</td></tr>}
          {!loading && report.invoices.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Tidak ada transaksi pada periode ini.</td></tr>}
          </tbody></table></div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5"><h3 className="text-[13px] font-semibold text-foreground">Rekap Penjualan per Buku</h3><input value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} aria-label="Cari buku dalam rekap" placeholder="Cari buku atau barcode" className="h-8 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-[12px]" /></div>
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b border-border text-left text-[12px] text-muted-foreground"><th className="px-3 py-2 font-medium">Buku</th><th className="px-3 py-2 font-medium">Barcode / ID</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Transaksi</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Kotor</th><th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Diskon</th><th className="px-3 py-2 text-right font-medium">Bersih</th></tr></thead><tbody>
          {visibleBooks.map((book) => <tr key={book.key} className="border-b border-border/50 last:border-0"><td className="px-3 py-2 font-medium text-foreground">{book.name}</td><td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{book.barcode || book.productId || "Snapshot historis"}</td><td className="px-3 py-2 text-right">{formatNumber(book.quantity)}</td><td className="px-3 py-2 text-right">{formatNumber(book.transactions)}</td><td className="hidden px-3 py-2 text-right sm:table-cell">{amount(book.gross)}</td><td className="hidden px-3 py-2 text-right sm:table-cell">{amount(book.allocatedDiscount)}</td><td className="px-3 py-2 text-right font-medium">{amount(book.netRevenue)}</td></tr>)}
          {visibleBooks.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{report.books.length ? "Tidak ada buku yang cocok." : "Tidak ada buku terjual pada periode ini."}</td></tr>}
        </tbody></table></div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-background p-4">
        <h3 className="mb-2 text-[13px] font-semibold text-foreground">Produk Terlaris</h3>
        {report.topProducts.length ? report.topProducts.map((book, index) => <div key={book.key} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-[13px] last:border-0"><span className="text-foreground">{index + 1}. {book.name}</span><span className="text-right text-muted-foreground">{formatNumber(book.quantity)} terjual · <b className="text-foreground">{amount(book.netRevenue)}</b></span></div>) : <p className="text-[12px] text-muted-foreground">Tidak ada produk terjual pada periode ini.</p>}
      </section>
    </div>
  );
}

function InvoiceRows({ order, lines, invoiceDiscount, isOpen, panelId, onToggle }: {
  order: import("@/lib/types").Order;
  lines: import("@/lib/sales-report").ReportLine[];
  invoiceDiscount: number;
  isOpen: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return <>
    <tr className="border-b border-border/50">
      <td className="px-3 py-2"><div className="flex items-start gap-2"><button type="button" aria-expanded={isOpen} aria-controls={panelId} aria-label={`${isOpen ? "Tutup" : "Buka"} rincian ${order.id}`} onClick={onToggle} className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><div><div className="font-medium text-foreground">{order.id}</div><div className="max-w-[220px] truncate text-[11px] text-muted-foreground md:hidden">{order.date} · {order.customerName} · {order.items.length} item</div></div></div></td>
      <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{order.date}</td><td className="hidden px-3 py-2 text-foreground md:table-cell">{order.customerName}</td><td className="hidden px-3 py-2 text-right text-muted-foreground md:table-cell">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="hidden px-3 py-2 text-right text-muted-foreground md:table-cell">{order.discount ? amount(order.discount) : "-"}</td><td className="px-3 py-2 text-right font-medium text-foreground">{amount(order.total)}</td>
    </tr>
    {isOpen && <tr id={panelId} className="border-b border-border/50 bg-muted/20"><td colSpan={6} className="px-3 py-3"><div className="mb-2 flex flex-wrap justify-between gap-2 text-[12px]"><div><span className="text-muted-foreground">Pelanggan: </span><span className="font-medium text-foreground">{order.customerName}</span><span className="ml-3 text-muted-foreground">Status: {order.status}</span></div><span className="text-muted-foreground">Subtotal {amount(order.subtotal)} · Diskon order {amount(order.discount)}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[12px]"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1.5 pr-2 font-medium">Produk</th><th className="px-2 py-1.5 text-right font-medium">Qty</th><th className="px-2 py-1.5 text-right font-medium">Harga Satuan</th><th className="px-2 py-1.5 text-right font-medium">Diskon Item</th><th className="px-2 py-1.5 text-right font-medium">Subtotal Item</th><th className="py-1.5 pl-2 text-right font-medium">Bersih Teralokasi</th></tr></thead><tbody>{lines.map(({ item, lineDiscount, allocatedNet }) => <tr key={item.id} className="border-b border-border/30 last:border-0"><td className="py-2 pr-2"><div className="font-medium text-foreground">{item.productName}</div><div className="font-mono text-[10px] text-muted-foreground">{item.productBarcode || "Tanpa barcode"}</div></td><td className="px-2 py-2 text-right">{formatNumber(item.quantity)}</td><td className="px-2 py-2 text-right">{amount(item.unitPrice)}</td><td className="px-2 py-2 text-right">{item.discountPercent}% · {amount(lineDiscount)}</td><td className="px-2 py-2 text-right">{amount(item.subtotal)}</td><td className="py-2 pl-2 text-right font-medium">{amount(allocatedNet)}</td></tr>)}</tbody></table></div>
      <div className="ml-auto mt-2 max-w-xs space-y-1 text-right text-[12px]"><div className="text-muted-foreground">Subtotal item <span className="text-foreground">{amount(lines.reduce((sum, line) => sum + line.item.subtotal, 0))}</span></div>{invoiceDiscount > 0 && <div className="text-muted-foreground">Diskon tingkat invoice <span className="text-destructive">−{amount(invoiceDiscount)}</span></div>}<div className="border-t border-border pt-1 font-semibold text-foreground">Total invoice {amount(order.total)}</div></div>
    </td></tr>}
  </>;
}
