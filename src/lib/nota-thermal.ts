import type { Order } from "./types";
import { formatRupiah } from "./currency";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWaktu(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Cetak nota (receipt) ke printer thermal, lebar kertas 58mm/80mm. */
export function printThermalNota(order: Order) {
  const w = window.open("", "_blank", "width=420");
  if (!w) return;

  const itemRows = order.items
    .map((it) => {
      const unit = it.discountPercent > 0
        ? `${it.quantity} x ${formatRupiah(it.unitPrice)} (-${it.discountPercent}%)`
        : `${it.quantity} x ${formatRupiah(it.unitPrice)}`;
      return `<div class="item">
        <div class="name">${esc(it.productName)}</div>
        <div class="row"><span>${esc(unit)}</span><span>${formatRupiah(it.subtotal)}</span></div>
      </div>`;
    })
    .join("");

  const discountRow = order.discount > 0
    ? `<div class="row"><span>Diskon</span><span>-${formatRupiah(order.discount)}</span></div>`
    : "";

  w.document.write(`<!DOCTYPE html><html><head><title>Nota ${order.id}</title>
    <style>
      @page{size:58mm auto;margin:0}
      *{box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:11px;line-height:1.35;margin:0;color:#000;background:#fff}
      .sheet{width:58mm;margin:0 auto;padding:4mm 2mm}
      .center{text-align:center}
      .store{font-weight:700;font-size:13px;margin-bottom:2px}
      .muted{color:#444}
      hr{border:none;border-top:1px dashed #000;margin:4px 0}
      .row{display:flex;justify-content:space-between;gap:6px}
      .info .row{font-size:11px}
      .item{margin:3px 0}
      .item .name{font-weight:700}
      .item .row{color:#222}
      .totals{margin-top:2px}
      .totals .grand{font-size:13px;font-weight:700;border-top:1px solid #000;margin-top:4px;padding-top:4px}
      .thanks{margin-top:10px;text-align:center}
      @media print{@page{size:58mm auto;margin:0}}
    </style></head><body>
      <div class="sheet">
        <div class="center store">ALFAN MEDIA</div>
        <div class="center muted">Jl. Contoh No. 123</div>
        <div class="center muted">Telp: 021-5551234</div>
        <hr/>
        <div class="info">
          <div class="row"><span>No</span><span>${esc(order.id)}</span></div>
          <div class="row"><span>Tgl</span><span>${esc(order.date)}</span></div>
          ${formatWaktu(order.createdAt) ? `<div class="row"><span>Jam</span><span>${esc(formatWaktu(order.createdAt))}</span></div>` : ""}
          <div class="row"><span>Pelanggan</span><span>${esc(order.customerName)}</span></div>
        </div>
        <hr/>
        ${itemRows}
        <hr/>
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
          ${discountRow}
          <div class="row grand"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
        </div>
        <div class="thanks">
          Terima kasih<br/>
          <span class="muted">Barang yang sudah dibeli<br/>tidak dapat ditukar</span>
        </div>
      </div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
  w.document.close();
}