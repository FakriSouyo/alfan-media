"use client";

import { useRef, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";

/**
 * Upload gambar sampul produk ke bucket "product-images".
 *
 * Props:
 *   - value    : path objek di storage saat ini (atau falsy bila kosong)
 *   - onChange : menerima path storage yang baru ("" untuk menghapus)
 *
 * Kontrak:
 *   - File disimpan di `products/<uuid>.<ext>` agar tidak bentrok.
 *   - GIF di-reject demi konsistensi (bucket hanya png/jpeg/webp).
 *   - Ukuran dibatasi 5MB (sama dengan bucket).
 *
 * Komponen ini dipakai di form tambah & edit produk. Tanpa storage (bucket
 * belum dibuat / gagal) akan menampilkan pesan, bukan crash.
 */
export function productImageUrl(path?: string | null): string | null {
  if (!path) return null;
  return getSupabaseBrowserClient().storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export function ProductImageUpload({
  value,
  onChange,
}: {
  value?: string;
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const publicUrl = value
    ? getSupabaseBrowserClient()
        .storage
        .from("product-images")
        .getPublicUrl(value).data.publicUrl
    : null;

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      if (!file.type.startsWith("image/")) {
        setError("File harus berupa gambar (PNG/JPG/WebP).");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Ukuran gambar maksimal 5MB.");
        return;
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `products/${crypto.randomUUID()}.${ext}`;
      setBusy(true);
      try {
        const sb = getSupabaseBrowserClient();
        const { error: upErr } = await sb.storage
          .from("product-images")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        // Hapus gambar lama bila sedang diganti (jangan hapus yang baru).
        if (value) {
          await sb.storage.from("product-images").remove([value]).catch(() => {});
        }
        onChange(path);
      } catch (e) {
        setError("Gagal mengunggah gambar. Pastikan bucket 'product-images' dikonfigurasi.");
        console.error("[product-image]", e);
      } finally {
        setBusy(false);
      }
    },
    [value, onChange]
  );

  const remove = useCallback(async () => {
    setError("");
    if (value) {
      await getSupabaseBrowserClient()
        .storage.from("product-images")
        .remove([value])
        .catch(() => {});
    }
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  }, [value, onChange]);

  const pickFile = () => inputRef.current?.click();
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={pickFile}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") pickFile();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-32 w-full cursor-pointer items-center gap-4 rounded-xl border border-dashed p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-ring sm:min-h-36 ${
          dragging ? "border-foreground bg-foreground/[0.06]" : "border-border/80 bg-muted/20 hover:bg-muted/40"
        }`}
      >
        <div className="relative flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background">
        {publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicUrl} alt="Sampul produk" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus size={22} className="text-muted-foreground/50" />
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 size={18} className="animate-spin text-foreground" />
          </div>
        )}
        </div>

        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">
            {value ? "Ganti gambar sampul" : "Tambahkan gambar sampul"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Klik di sini atau seret gambar ke area ini.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">PNG/JPG/WebP · maksimal 5MB</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.04] disabled:opacity-50"
        >
          {value ? "Pilih gambar lain" : "Pilih dari perangkat"}
        </button>
        {value && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              remove();
            }}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 size={12} /> Hapus gambar
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
