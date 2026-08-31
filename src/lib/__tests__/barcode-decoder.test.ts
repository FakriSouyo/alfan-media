import { describe, it, expect } from "vitest";
import {
  MultiFormatReader,
  QRCodeWriter,
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  type BitMatrix,
} from "@zxing/library";

/**
 * Verifikasi jalur fallback scan kamera (ZXing, pure-JS).
 *
 * Alurnya sama persis dengan `BrowserMultiFormatReader.decodeFromCanvas`
 * di hook: canvas → luminance (grey) → HybridBinarizer → BinaryBitmap →
 * MultiFormatReader.decode dengan hints kosong (default: semua format).
 *
 * Catatan: di @zxing/library (port TS), `RGBLuminanceSource` dengan
 * Uint8ClampedArray menganggap datanya SUDAH grayscale 1-byte/pixel
 * (bukan triplet RGB seperti versi Java yang memakai int[] ARGB).
 */

function graySource(width: number, height: number, gray: (x: number, y: number) => number): RGBLuminanceSource {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = gray(x, y);
    }
  }
  return new RGBLuminanceSource(data, width, height, width, height, 0, 0);
}

/**
 * Persis dengan apa yang dilakukan `BrowserMultiFormatReader.decodeFromCanvas`
 * di hook: luminance → HybridBinarizer → BinaryBitmap → decode, hints kosong.
 */
function decode(luminance: RGBLuminanceSource): string {
  const hints = new Map(); // BrowserCodeReader memakai `new Map()` kosong
  const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminance));
  const result = new MultiFormatReader().decode(binaryBitmap, hints);
  return result.getText();
}

// ── Encoder EAN-13 minimal (hanya untuk test) ───────────────────────────────
// zxing-js tidak menyertakan writer EAN/1D, jadi bit-pattern disusun manual
// sesuai spesifikasi EAN-13 (L/G/R code tables + parity check digit).
const L_CODES = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const G_CODES = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const R_CODES = L_CODES.map((c) => c.split("").map((b) => (b === "0" ? "1" : "0")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Susun bit-pattern EAN-13 + quiet zone, return luminance source. */
function ean13Source(digits12: string): RGBLuminanceSource {
  const check = ean13CheckDigit(digits12);
  const code = digits12 + String(check);
  const parity = PARITY[Number(code[0])];

  let bits = "101"; // guard kiri
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += parity[i - 1] === "L" ? L_CODES[d] : G_CODES[d];
  }
  bits += "01010"; // guard tengah
  for (let i = 7; i <= 12; i++) {
    bits += R_CODES[Number(code[i])];
  }
  bits += "101"; // guard kanan

  const quiet = 10; // modul
  const barWidth = 2; // 1 modul = 2px
  const height = 96;
  const width = (bits.length + quiet * 2) * barWidth;
  return graySource(width, height, (x) => {
    const modIdx = Math.floor(x / barWidth) - quiet;
    if (modIdx < 0 || modIdx >= bits.length) return 255; // quiet zone
    return bits[modIdx] === "1" ? 0 : 255;
  });
}

describe("Barcode decoder fallback (ZXing)", () => {
  it("decode EAN-13 (format barcode buku standar)", () => {
    const digits12 = "899099900193";
    const expected = digits12 + String(ean13CheckDigit(digits12));
    expect(decode(ean13Source(digits12))).toBe(expected);
  });

  it("decode QR (digocek via writer resmi ZXing)", () => {
    const text = "ALFAN-MEDIA-INV-2026";
    const matrix: BitMatrix = new QRCodeWriter().encode(
      text,
      BarcodeFormat.QR_CODE,
      220,
      220,
      new Map() // hints — zxing-js mengakses .get() tanpa null-check
    );
    // BitMatrix port TS: true = modul hitam.
    const w = matrix.getWidth();
    const h = matrix.getHeight();
    const source = graySource(w, h, (x, y) => (matrix.get(x, y) ? 0 : 255));
    expect(decode(source)).toBe(text);
  });

  it("reader tolak sumber kosong (jangan crash)", () => {
    const source = graySource(64, 64, () => 255); // semua putih
    expect(() => decode(source)).toThrow();
  });
});
