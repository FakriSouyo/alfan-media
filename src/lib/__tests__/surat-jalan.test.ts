import { describe, it, expect, vi, afterEach } from "vitest";
import { printSuratJalan } from "@/lib/surat-jalan";
import type { Order } from "@/lib/types";

let captured = "";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubWindow() {
  const fake = {
    document: { write: (h: string) => { captured += h; }, close: () => {} },
  };
  vi.stubGlobal("open", vi.fn(() => fake));
  window.open = vi.fn(() => fake) as unknown as typeof window.open;
}

const order: Order = {
  id: "INV-001",
  date: "2026-08-27",
  customerId: null,
  customerName: "SDN <05> Bandung",
  items: [
    { id: "1", productId: "p1", productName: "IPA & Sains", productBarcode: "BC1", quantity: 20, unitPrice: 60000, priceTier: "Sekolah", customPrice: null, discountPercent: 10, subtotal: 1080000 },
  ],
  subtotal: 1200000,
  discount: 120000,
  total: 1080000,
  status: "COMPLETED",
  revisions: [],
  createdAt: "2026-08-28",
  updatedAt: "2026-08-28",
};

describe("printSuratJalan", () => {
  it("melengkapi default surat jalan dari order", () => {
    stubWindow();
    printSuratJalan(order);
    expect(captured).toBeTruthy();
    expect(captured).toContain("SURAT IZIN JALAN");
    expect(captured).toContain("SJ-INV-001");
  });

  it("escape html pada nama produk & pelanggan, & ampersan", () => {
    stubWindow();
    printSuratJalan(order);
    expect(captured).toContain("IPA &amp; Sains");
    expect(captured).toContain("SDN &lt;05&gt; Bandung");
  });

  it("menampilkan diskon & total", () => {
    stubWindow();
    printSuratJalan(order);
    expect(captured).toContain("Diskon");
  });
});