import type { Category } from "@/lib/types";

/**
 * Label kategori + jenjang/kelas dalam bentuk teks datar.
 * "Matematika" atau "Matematika (SD I)" — dipakai di tabel, CSV, dan cetakan.
 * Kategori tanpa level (umum) hanya menampilkan nama.
 */
export function categoryText(c: Category | null | undefined): string {
  if (!c) return "-";
  return c.level ? `${c.name} (${c.level})` : c.name;
}

/**
 * Nama kategori dengan badge jenjang/kelas — dipakai di item Select, tabel,
 * daftar produk (POS), dan item keranjang. Badge jenjang selalu tampil kalau
 * kategorinya punya level (mis. "Matematika" → Matematika [SD I]).
 */
export function CategoryName({
  c,
  className,
  badgeClassName,
}: {
  c: Category | null | undefined;
  className?: string;
  /** Override style badge — mis. lebih kecil di card keranjang. */
  badgeClassName?: string;
}) {
  if (!c) return <span className={className}>-</span>;
  return (
    <span className={className}>
      {c.name}
      {c.level && (
        <span
          className={
            "ml-1.5 inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-px align-middle text-[11px] font-semibold leading-[1.5] " +
            (badgeClassName ?? "bg-foreground/[0.12] text-foreground/85")
          }
        >
          {c.level}
        </span>
      )}
    </span>
  );
}
