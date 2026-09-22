import type { Order, SuratJalan } from "./types";

/** Alamat toko — dipakai di kop surat & nota. */
export const STORE_ADDRESS =
  "Jl. Pattimura No.46A, Khusus Kota Selong, Kec. Selong, Kabupaten Lombok Timur, Nusa Tenggara Barat. 83619";

function formatTanggal(value: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mencetak surat izin jalan (PDF) untuk sebuah pesanan. Memakai data surat
 * jalan yang bisa diedit (no, tanggal, pengirim, penerima, catatan) tersimpan
 * di `order.suratJalan`; jika belum ada, memakai nilai default. PDF lengkap:
 * seluruh item + harga satuan + jumlah per baris, lalu subtotal/diskon/total.
 */
export function printSuratJalan(order: Order) {
  const sj: SuratJalan = {
    no: "SJ-" + order.id,
    tanggal: order.date,
    // Pengirim = toko itu sendiri.
    pengirim: "Alfan Media",
    penerima: order.customerName,
    estimasi: "",
    namaPengirim: "",
    kendaraan: "",
    catatan: "",
    ...(order.suratJalan ?? {}),
  };
  const no = (sj.no || "SJ-" + order.id).trim();
  const pengirimInfo = sj.namaPengirim
    ? `${sj.pengirim} (${sj.namaPengirim})`
    : sj.pengirim;

  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;

  const rows = order.items
    .map(
      (it, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(it.productName)}<br/><span style="color:#888;font-size:10px">Barcode: ${esc(it.productBarcode)}</span></td>
        <td style="text-align:center">${it.quantity}</td>
      </tr>`
    )
    .join("");

  w.document.write(`<!DOCTYPE html><html><head><title>Surat Izin Jalan ${order.id}</title>
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
      .catatan{margin:14px 0;font-size:11px}
      .catatan .box{border:1px solid #ddd;padding:8px;margin-top:4px;min-height:28px}
      .signatures{display:flex;justify-content:space-between;margin-top:48px;font-size:11px}
      .signatures>div{width:45%;text-align:center;line-height:1.6}
      .signatures .role{color:#666}
      .signatures .name{font-weight:600;margin-top:8px;min-height:16px}
      .signatures .line{border-top:1px solid #333;margin-top:52px;padding-top:4px}
      .footer{margin-top:24px;font-size:10px;text-align:center;color:#999}
      @media print{body{margin:10px}}
    </style></head><body>
    <div class="header">
      <div class="store">ALFAN MEDIA</div>
      <div class="sub-store">${esc(STORE_ADDRESS)}</div>
      <h2>SURAT IZIN JALAN</h2>
    </div>
    <div class="info">
      <table>
        <tr><td class="label">No</td><td>${esc(no)}</td></tr>
        <tr><td class="label">Referensi</td><td>${esc(order.id)}</td></tr>
        <tr><td class="label">Tanggal Kirim</td><td>${formatTanggal(sj.tanggal)}</td></tr>
        <tr><td class="label">Pengirim</td><td>${esc(pengirimInfo)}</td></tr>
        ${sj.estimasi ? `<tr><td class="label">Estimasi</td><td>${esc(sj.estimasi)}</td></tr>` : ""}
        <tr><td class="label">Penerima</td><td>${esc(sj.penerima)}</td></tr>
        ${sj.kendaraan ? `<tr><td class="label">No. Kendaraan</td><td>${esc(sj.kendaraan)}</td></tr>` : ""}
      </table>
    </div>
    <table class="items">
      <thead><tr><th style="width:6%">No</th><th>Nama Barang</th><th style="width:12%">Banyaknya</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sj.catatan ? `<div class="catatan"><b>Catatan:</b><div class="box">${esc(sj.catatan)}</div></div>` : ""}
    <div class="signatures">
      <div><div class="role">Pengirim</div><div class="name">${esc(sj.namaPengirim || sj.pengirim)}</div>${sj.kendaraan ? `<div style="font-size:10px;color:#666">${esc(sj.kendaraan)}</div>` : ""}<div class="line">Tanda tangan &amp; Stempel</div></div>
      <div><div class="role">Penerima</div><div class="name">${esc(sj.penerima)}</div><div class="line">Tanda tangan</div></div>
    </div>
    <div class="footer">Dokumen ini dicetak otomatis dari sistem Alfan Media</div>
    <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}