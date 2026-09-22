import { describe, it, expect, vi, afterEach } from "vitest";
import { printThermalNota } from "@/lib/nota-thermal";
import type { Order } from "@/lib/types";

let captured = "";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubWindow() {
  const fake = {
    document: {
      write: (html: string) => { captured += html; },
      close: () => {},
    },
  };
  vi.stubGlobal("open", vi.fn(() => fake));
  // kode memanggil window.open(...) — pastikan window.open ikut ter-stub.
  window.open = vi.fn(() => fake) as unknown as typeof window.open;
}

const order: Order = {
  id: "INV-001",
  date: "2026-08-27",
  customerId: null,
  customerName: "Ibu <Siti>",
  items: [
    { id: "1", productId: "p1", productName: "Buku <A>", productBarcode: "BC1", quantity: 2, unitPrice: 50000, priceTier: "Normal", customPrice: null, discountPercent: 0, subtotal: 100000, costPrice: 30000 },
  ],
  subtotal: 100000,
  discount: 5000,
  total: 95000,
  status: "COMPLETED",
  revisions: [],
  createdAt: "2026-08-27T09:00:00",
  updatedAt: "2026-08-27T09:00:00",
};

describe("printThermalNota", () => {
  it("escape elemen HTML dari nama produk & pelanggan", () => {
    stubWindow();
    printThermalNota(order);
    expect(captured).toBeTruthy();
    // <A> milik user harus di-escape
    expect(captured).toContain("Buku &lt;A&gt;");
    expect(captured).toContain("Ibu &lt;Siti&gt;");
    expect(captured).not.toContain("<div class=\"name\">Buku <A>");
  });

  it("mencantumkan diskon & total", () => {
    stubWindow();
    printThermalNota(order);
    expect(captured).toContain("Diskon");
    // total 95000 difer format IDR -> "Rp 95.000" (spasi non-breaking & titik).
    expect(captured).toContain("95.000");
  });

  it("melewati window.open yang null tanpa crash", () => {
    vi.stubGlobal("open", vi.fn(() => null));
    expect(() => printThermalNota(order)).not.toThrow();
  });
});