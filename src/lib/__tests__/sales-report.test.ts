import { describe, expect, it } from "vitest";
import { allocateProportionally, buildSalesReport, csvCell, escapeHtml, toCsv } from "../sales-report";
import type { Order } from "../types";

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: "INV-001", date: "2026-10-10", customerId: null, customerName: "Toko A", items: [
    { id: "i1", productId: "p1", productName: "Matematika X", productBarcode: "123", quantity: 2, unitPrice: 30000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 60000, costPrice: 10000 },
    { id: "i2", productId: "p2", productName: "Matematika X", productBarcode: "456", quantity: 1, unitPrice: 45000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 45000, costPrice: 15000 },
  ], subtotal: 105000, discount: 0, total: 105000, status: "COMPLETED", revisions: [], createdAt: "", updatedAt: "", ...overrides,
});

describe("sales report transformation", () => {
  it("includes checked out and completed once, excluding draft and cancelled orders", () => {
    const orders = [makeOrder(), makeOrder({ id: "INV-002", status: "CHECKED_OUT" }), makeOrder({ id: "INV-003", status: "DRAFT" }), makeOrder({ id: "INV-004", status: "CANCELLED" })];
    const report = buildSalesReport(orders, { start: "2026-10-10", end: "2026-10-10" });
    expect(report.totalTransactions).toBe(2);
    expect(report.totalRevenue).toBe(210000);
  });

  it("does not merge different product ids with the same name and keeps deleted snapshots", () => {
    const report = buildSalesReport([makeOrder()], { start: "2026-10-10", end: "2026-10-10" });
    expect(report.books).toHaveLength(2);
    expect(report.books.every((row) => row.name === "Matematika X")).toBe(true);
    expect(report.invoices[0].lines.map(({ item, gross, lineDiscount, allocatedNet }) => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gross,
      lineDiscount,
      allocatedNet,
    }))).toEqual([
      { name: "Matematika X", quantity: 2, unitPrice: 30000, gross: 60000, lineDiscount: 0, allocatedNet: 60000 },
      { name: "Matematika X", quantity: 1, unitPrice: 45000, gross: 45000, lineDiscount: 0, allocatedNet: 45000 },
    ]);
  });

  it("uses barcode for deleted products and keeps unidentifiable snapshots separate", () => {
    const order = makeOrder({ items: [
      { id: "i1", productId: "", productName: "Book", productBarcode: "A", quantity: 1, unitPrice: 10, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 10, costPrice: 0 },
      { id: "i2", productId: "", productName: "Book", productBarcode: "A", quantity: 2, unitPrice: 10, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 20, costPrice: 0 },
      { id: "i3", productId: "", productName: "Book", productBarcode: "", quantity: 1, unitPrice: 10, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 10, costPrice: 0 },
    ], subtotal: 40, discount: 0, total: 40 });
    const report = buildSalesReport([order], { start: "2026-10-10", end: "2026-10-10" });
    expect(report.books).toHaveLength(2);
    expect(report.books.find((row) => row.barcode === "A")?.quantity).toBe(3);
  });

  it("allocates order discounts deterministically and reconciles book net revenue", () => {
    expect(allocateProportionally(10, [1, 1, 1])).toEqual([4, 3, 3]);
    const report = buildSalesReport([makeOrder({ discount: 10000, total: 95000 })], { start: "2026-10-10", end: "2026-10-10" });
    expect(report.books.reduce((sum, row) => sum + row.netRevenue, 0)).toBe(95000);
    expect(report.books.reduce((sum, row) => sum + row.allocatedDiscount, 0)).toBe(10000);
  });

  it("counts item and invoice discounts in the report summary", () => {
    const order = makeOrder({
      discount: 5000,
      subtotal: 100000,
      total: 95000,
      items: [
        { id: "i1", productId: "p1", productName: "Matematika X", productBarcode: "123", quantity: 2, unitPrice: 30000, priceTier: "Normal", customPrice: null, discountPercent: 5, subtotal: 57000, costPrice: 10000 },
        { id: "i2", productId: "p2", productName: "Matematika X", productBarcode: "456", quantity: 1, unitPrice: 45000, priceTier: "Normal", customPrice: null, discountPercent: 4.44, subtotal: 43000, costPrice: 15000 },
      ],
    });
    expect(buildSalesReport([order], { start: "2026-10-10", end: "2026-10-10" }).totalDiscount).toBe(10000);
  });

  it("escapes HTML and CSV fields and mitigates formula injection", () => {
    expect(escapeHtml('<b>&"x</b>')).toBe("&lt;b&gt;&amp;&quot;x&lt;/b&gt;");
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(toCsv([["Toko, A", '"Book"', 1000]])).toBe('"Toko, A","""Book""","1000"');
  });
});
