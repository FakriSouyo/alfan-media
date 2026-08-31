// Catatan: vitest.setup.ts mematikan auto-cleanup RTL (dipakai test
// store-context), jadi test ini melakukan cleanup manual.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentMarkdown } from "@/components/agent/markdown";

afterEach(() => {
  cleanup();
});

describe("AgentMarkdown", () => {
  it("merender tabel GFM menjadi <table> sungguhan", () => {
    render(
      <AgentMarkdown
        text={"| Metrik | Nilai |\n|---|---|\n| Jumlah transaksi | 32 |\n"}
      />,
    );
    expect(document.querySelector("table")).not.toBeNull();
    expect(document.querySelector("th")?.textContent).toBe("Metrik");
    const tds = document.querySelectorAll("td");
    expect(tds.length).toBe(2);
    expect(tds[1]?.textContent).toBe("32");
  });

  it("merender daftar + tebal + emoji", () => {
    render(
      <AgentMarkdown
        text={"- 📊 Melihat **penjualan hari ini**\n- 📦 Mengecek **stok**"}
      />,
    );
    const items = document.querySelectorAll("ul li");
    expect(items.length).toBe(2);
    expect(document.querySelector("ul strong")?.textContent).toBe(
      "penjualan hari ini",
    );
    expect(document.querySelector("ul li")?.textContent).toContain("📊");
  });

  it("hideTables menyembunyikan tabel tapi narasi tetap tampil", () => {
    const { rerender } = render(
      <AgentMarkdown
        text={"Berikut produknya:\n\n| Produk | Stok |\n|---|---|\n| IPA | 0 |\n\n⚠️ Sudah habis."}
      />,
    );
    expect(document.querySelector("table")).not.toBeNull();
    rerender(
      <AgentMarkdown
        text={"Berikut produknya:\n\n| Produk | Stok |\n|---|---|\n| IPA | 0 |\n\n⚠️ Sudah habis."}
        hideTables
      />,
    );
    expect(document.querySelector("table")).toBeNull();
    expect(document.body.textContent).toContain("Berikut produknya:");
    expect(document.body.textContent).toContain("⚠️ Sudah habis.");
  });

  it("tidak mengeksekusi HTML mentah dari output LLM", () => {
    render(<AgentMarkdown text={"<script>alert(1)</script> **aman**"} />);
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.textContent).toContain("<script>alert(1)</script>");
  });
});
