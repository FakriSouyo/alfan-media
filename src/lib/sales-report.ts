import type { Order, OrderItem } from "./types";
import type { DateRange } from "./business-date";

export interface ReportLine {
  item: OrderItem;
  gross: number;
  lineDiscount: number;
  allocatedNet: number;
}

export interface ReportInvoice {
  order: Order;
  lines: ReportLine[];
  itemSubtotal: number;
  invoiceDiscount: number;
}

export interface BookSalesRow {
  key: string;
  name: string;
  barcode: string;
  productId: string;
  quantity: number;
  transactions: number;
  gross: number;
  allocatedDiscount: number;
  netRevenue: number;
}

export interface SalesReportData {
  invoices: ReportInvoice[];
  books: BookSalesRow[];
  topProducts: BookSalesRow[];
  totalRevenue: number;
  totalTransactions: number;
  totalItems: number;
  totalDiscount: number;
  averageOrder: number;
}

export function isRecognizedSale(status: Order["status"]): boolean {
  return status === "CHECKED_OUT" || status === "COMPLETED";
}

/** Deterministic largest-remainder allocation; the result always sums to total. */
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const amount = Math.max(0, Math.round(total));
  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const effective = weightSum > 0 ? safeWeights : weights.map(() => 1);
  const denominator = weightSum > 0 ? weightSum : weights.length;
  const exact = effective.map((weight) => (amount * weight) / denominator);
  const allocated = exact.map(Math.floor);
  const remainder = amount - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i += 1) allocated[order[i % order.length].index] += 1;
  return allocated;
}

export function allocateOrderItemNet(order: Order): number[] {
  return allocateProportionally(order.total, order.items.map((item) => item.subtotal));
}

function productGroupKey(order: Order, item: OrderItem): string {
  if (item.productId) return `id:${item.productId}`;
  const barcode = item.productBarcode.trim();
  if (barcode) return `barcode:${barcode.toLocaleLowerCase("id-ID")}`;
  // Without a product id or barcode, the historical snapshot cannot safely
  // distinguish two books with the same name. Keep that line independent.
  return `snapshot:${order.id}:${item.id}`;
}

export function buildSalesReport(orders: Order[], range: DateRange): SalesReportData {
  const eligible = range.error
    ? []
    : orders
        .filter((order) => isRecognizedSale(order.status) && order.date >= range.start && order.date <= range.end)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const invoices: ReportInvoice[] = eligible.map((order) => {
    const items = order.items;
    const itemSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const invoiceDiscount = Math.max(0, itemSubtotal - order.total);
    const allocatedNets = allocateOrderItemNet(order);
    return {
      order,
      itemSubtotal,
      invoiceDiscount,
      lines: items.map((item, index) => {
        const gross = item.unitPrice * item.quantity;
        return {
          item,
          gross,
          lineDiscount: Math.max(0, gross - item.subtotal),
          allocatedNet: allocatedNets[index] ?? 0,
        };
      }),
    };
  });

  const grouped = new Map<string, BookSalesRow & { invoiceIds: Set<string> }>();
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const key = productGroupKey(invoice.order, line.item);
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += line.item.quantity;
        existing.gross += line.gross;
        existing.netRevenue += line.allocatedNet;
        existing.allocatedDiscount += line.gross - line.allocatedNet;
        existing.invoiceIds.add(invoice.order.id);
      } else {
        grouped.set(key, {
          key,
          name: line.item.productName,
          barcode: line.item.productBarcode,
          productId: line.item.productId,
          quantity: line.item.quantity,
          transactions: 0,
          gross: line.gross,
          allocatedDiscount: line.gross - line.allocatedNet,
          netRevenue: line.allocatedNet,
          invoiceIds: new Set([invoice.order.id]),
        });
      }
    }
  }
  const books = [...grouped.values()]
    .map(({ invoiceIds, ...row }) => ({ ...row, transactions: invoiceIds.size }))
    .sort((a, b) => b.quantity - a.quantity || b.netRevenue - a.netRevenue || a.name.localeCompare(b.name, "id"));
  const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.order.total, 0);
  const totalTransactions = invoices.length;
  const totalDiscount = invoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.lines.reduce((gross, line) => gross + line.gross, 0) - invoice.order.total),
    0
  );
  return {
    invoices,
    books,
    topProducts: books.slice(0, 5),
    totalRevenue,
    totalTransactions,
    totalItems: invoices.reduce((sum, invoice) => sum + invoice.order.items.reduce((n, item) => n + item.quantity, 0), 0),
    totalDiscount,
    averageOrder: totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0,
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
