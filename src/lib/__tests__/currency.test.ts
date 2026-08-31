import { describe, it, expect } from "vitest";
import {
  formatRupiah,
  formatRupiahShort,
  formatNumber,
  parseRupiah,
} from "@/lib/currency";

describe("currency helpers", () => {
  it("formatRupiah memformat angka int ke IDR tanpa desimal", () => {
    expect(formatRupiah(50000)).toBe("Rp\u00a050.000");
    expect(formatRupiah(0)).toContain("0");
    // gunakan normalisasi spasi non-breaking supaya sederhana
    expect(formatRupiah(1234567).replace(/\u00a0/g, " ")).toBe("Rp 1.234.567");
  });

  it("formatRupiah tetap aman untuk angka kecil / besar", () => {
    expect(formatRupiah(1).replace(/\u00a0/g, " ")).toBe("Rp 1");
    expect(formatRupiah(1_000_000_000).replace(/\u00a0/g, " ")).toBe("Rp 1.000.000.000");
  });

  it("formatRupiahShort memakai satuan K / jt", () => {
    expect(formatRupiahShort(50000)).toBe("Rp50K");
    expect(formatRupiahShort(1_500_000)).toBe("Rp1.5jt");
    expect(formatRupiahShort(500)).toBe("Rp\u00a0500");
  });

  it("formatNumber memberi separator ribuan", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatNumber(0)).toBe("0");
  });

  it("parseRupiah menghapus semua karakter non-digit", () => {
    expect(parseRupiah("Rp 1.234.567")).toBe(1234567);
    expect(parseRupiah("Rp50K")).toBe(50);
    expect(parseRupiah("abc")).toBe(0);
    expect(parseRupiah("")).toBe(0);
  });
});