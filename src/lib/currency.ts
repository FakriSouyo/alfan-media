/**
 * Format a number as Indonesian Rupiah.
 * Uses integer amounts to avoid floating point issues.
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Short format: Rp50K, Rp1.2M */
export function formatRupiahShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `Rp${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000_000) {
    return `Rp${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}jt`;
  }
  if (amount >= 1_000) {
    return `Rp${(amount / 1_000).toFixed(0)}K`;
  }
  return formatRupiah(amount);
}

/** Format a number with thousands separator (no currency symbol). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Parse a currency string back to integer. */
export function parseRupiah(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, "");
  return cleaned ? parseInt(cleaned, 10) : 0;
}
