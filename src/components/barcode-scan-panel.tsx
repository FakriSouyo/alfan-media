"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBarcodeScanner, type ScanStatus } from "@/hooks/use-barcode-scanner";
import { Hash, ScanBarcode, CheckCircle2, AlertTriangle, X } from "lucide-react";

/**
 * Panel "Mode Scan" untuk POS: buka sekali (toggle dari header keranjang),
 * kamera terus menyala dan setiap barcode baru langsung diproses lewat
 * `onScan` — tanpa harus klik-klik lagi. Indikator status:
 * hijau = terhubung, kuning = menyiapkan, merah = error/tidak didukung,
 * abu = mati.
 *
 * Kalau kamera tidak bisa dipakai (browser tidak mendukung / izin ditolak),
 * panel otomatis menyediakan input manual sebagai fallback.
 */

const STATUS_META: Record<ScanStatus, { dot: string; label: string; text: string }> = {
  off: { dot: "bg-muted-foreground/40", label: "Nonaktif", text: "text-muted-foreground" },
  starting: { dot: "bg-amber-500 animate-pulse", label: "Menyiapkan kamera…", text: "text-amber-500" },
  connected: { dot: "bg-emerald-500", label: "Terhubung", text: "text-emerald-500" },
  error: { dot: "bg-destructive", label: "Kamera error", text: "text-destructive" },
  unsupported: { dot: "bg-destructive", label: "Kamera tak tersedia", text: "text-destructive" },
};

export function ScanStatusDot({ status, className }: { status: ScanStatus; className?: string }) {
  return (
    <span
      title={STATUS_META[status].label}
      className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_META[status].dot, className)}
    />
  );
}

export function BarcodeScanPanel({
  onScan,
  onStatus,
  onStop,
}: {
  /** Proses sebuah kode. Return null = sukses, string = pesan error. */
  onScan: (code: string) => string | null;
  /** Lapor status terkini ke parent (untuk indikator di header keranjang). */
  onStatus: (status: ScanStatus) => void;
  /** Dipanggil tombol "Mati" — parent unmount panel ini. */
  onStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lastResult, setLastResult] = useState<{ code: string; message: string | null; at: number } | null>(null);
  const [manual, setManual] = useState("");

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  const reportResult = useCallback((code: string, message: string | null) => {
    const at = Date.now();
    setLastResult({ code, message, at });
    window.setTimeout(() => {
      setLastResult((r) => (r && r.at === at ? null : r));
    }, 2000);
  }, []);

  const onDetect = useCallback(
    (code: string) => {
      reportResult(code, onScanRef.current(code));
    },
    [reportResult]
  );

  const { status, error, start, stop } = useBarcodeScanner({ videoRef, onDetect });

  // Lapor status ke parent.
  useEffect(() => {
    onStatusRef.current(status);
  }, [status]);

  // Mulai kamera begitu panel ter-mount; stop saat unmount.
  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  const showCamera = status === "starting" || status === "connected";
  const showFallback = status === "error" || status === "unsupported";

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    const message = onScan(code);
    reportResult(code, message);
    if (!message) setManual("");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      {/* Header panel */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ScanBarcode size={14} className="text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">Mode Scan</span>
        <ScanStatusDot status={status} />
        <span className={cn("text-[11px] font-medium", STATUS_META[status].text)}>
          {STATUS_META[status].label}
        </span>
        <button
          onClick={onStop}
          className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/[0.04]"
        >
          <X size={12} /> Mati
        </button>
      </div>

      <div className="p-2">
        {/* Preview kamera */}
        {showCamera && (
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-[4/3] w-full object-cover sm:aspect-video"
            />
            {/* Frame panduan */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-1/2 w-4/5">
                <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-md border-l-2 border-t-2 border-white/80" />
                <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-md border-r-2 border-t-2 border-white/80" />
                <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-md border-b-2 border-l-2 border-white/80" />
                <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-md border-b-2 border-r-2 border-white/80" />
              </div>
            </div>
            {/* Chip hasil scan terakhir */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
              {lastResult ? (
                lastResult.message ? (
                  <span className="flex max-w-full items-center gap-1.5 rounded-full bg-destructive/90 px-3 py-1 text-[11px] font-medium text-white">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span className="truncate">{lastResult.message}</span>
                  </span>
                ) : (
                  <span className="flex max-w-full items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 text-[11px] font-medium text-white">
                    <CheckCircle2 size={12} className="shrink-0" />
                    <span className="truncate">Masuk keranjang</span>
                  </span>
                )
              ) : (
                <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
                  {status === "connected" ? "Arahkan barcode ke dalam kotak — scan berulang otomatis" : "Menyiapkan kamera…"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fallback: kamera error / tidak didukung */}
        {showFallback && (
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-[12px] text-foreground",
                "border-destructive/30 bg-destructive/5"
              )}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
              <span>
                {error || "Kamera tidak bisa dipakai."} Pakai input manual di bawah — atau scan pakai
                scanner USB langsung ke kotak pencarian produk.
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitManual();
                  }}
                  placeholder="Ketik barcode lalu Enter"
                  className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                onClick={submitManual}
                disabled={!manual.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
              >
                <ScanBarcode size={14} /> Tambah
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
