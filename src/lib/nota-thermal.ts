import type { Order } from "./types";
import { formatRupiah } from "./currency";
import { STORE_ADDRESS } from "./surat-jalan";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTanggal(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Cetak NOTA (faktur penjualan) dengan tata letak formal menyusul surat jalan
 * — kop toko + alamat, tabel barang, subtotal/diskon/total, dan tanda tangan.
 * (Bukan lagi format struk thermal 58mm.)
 */
export function printThermalNota(order: Order) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;

  const rows = order.items
    .map(
      (it, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(it.productName)}<br/><span style="color:#888;font-size:10px">${esc(it.productBarcode)}</span></td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:right">${formatRupiah(it.unitPrice)}</td>
        <td style="text-align:right">${it.discountPercent > 0 ? `${formatRupiah(it.subtotal)} <span style="color:#c0392b">(-${it.discountPercent}%)</span>` : formatRupiah(it.subtotal)}</td>
      </tr>`
    )
    .join("");

  const discountRow =
    order.discount > 0
      ? `<div style="display:flex;justify-content:space-between;padding:2px 0;color:#c0392b"><span>Diskon</span><span>-${formatRupiah(order.discount)}</span></div>`
      : "";

  w.document.write(`<!DOCTYPE html><html><head><title>Nota ${order.id}</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;font-size:12px;margin:20px;color:#333}
      h2{text-align:center;margin:0 0 2px;font-size:18px;letter-spacing:3px}
      .store{text-align:center;font-size:12px;font-weight:700;margin-bottom:2px}
      .sub-store{text-align:center;font-size:10px;color:#666;margin-bottom:14px}
      .header{text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:14px}
      .info{font-size:11px;line-height:1.8;margin-bottom:14px}
      .info table{width:100%}
      .info td.label{width:110px;color:#666}
      table.items{width:100%;border-collapse:collapse;margin:6px 0 12px}
      table.items th,table.items td{padding:5px 6px;text-align:left;border-bottom:1px solid #ddd;font-size:11px}
      table.items th{background:#f5f5f5;font-weight:600}
      .totals{max-width:300px;margin-left:auto;font-size:12px}
      .totals>div{display:flex;justify-content:space-between;padding:2px 0}
      .totals .total{font-weight:700;font-size:14px;border-top:1px solid #333;padding-top:6px;margin-top:4px}
      .signatures{display:flex;justify-content:space-between;margin-top:56px;font-size:11px}
      .signatures>div{width:45%;text-align:center;line-height:1.6}
      .signatures .role{color:#666}
      .signatures .line{border-top:1px solid #333;margin-top:52px;padding-top:4px}
      .thanks{text-align:center;font-size:11px;color:#666;margin-top:28px}
      .footer{margin-top:24px;font-size:10px;text-align:center;color:#999}
      @media print{body{margin:10px}}
    </style></head><body>
    <div class="header">
      <div class="store">ALFAN MEDIA</div>
      <div class="sub-store">${esc(STORE_ADDRESS)}</div>
      <h2>NOTA PENJUALAN</h2>
    </div>
    <div class="info">
      <table>
        <tr><td class="label">No</td><td>${esc(order.id)}</td></tr>
        <tr><td class="label">Tanggal</td><td>${formatTanggal(order.date)}</td></tr>
        <tr><td class="label">Pelanggan</td><td>${esc(order.customerName)}</td></tr>
      </table>
    </div>
    <table class="items">
      <thead><tr><th style="width:6%">No</th><th>Nama Barang</th><th style="width:9%">Banyaknya</th><th style="width:16%">Harga Satuan</th><th style="width:18%">Jumlah</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
      ${discountRow}
      <div class="total"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
    </div>
    <div class="signatures">
      <div><div class="role">Petugas</div><div class="line">Tanda tangan</div></div>
      <div><div class="role">Pembeli</div><div class="line">Tanda tangan</div></div>
    </div>
    <div class="thanks">Terima kasih atas kunjungan Anda.<br/>Barang yang sudah dibeli tidak dapat ditukar.</div>
    <div class="footer">Nota dicetak otomatis dari sistem Alfan Media</div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  w.document.close();
}