"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Mesin scan barcode berbasis kamera.
 *
 * Decoder (urutan preferensi):
 * 1. API native `BarcodeDetector` (Chrome modern) — tercepat.
 * 2. **ZXing** (pure JS, lazy-load) — fallback untuk browser tanpa
 *    BarcodeDetector (Firefox, Chrome lama), tetap jalan di HTTPS/localhost.
 *
 * Catatan penting: `navigator.mediaDevices` (kamera) HANYA tersedia di
 * secure context (HTTPS atau localhost). Kalau aplikasi dibuka lewat
 * `http://alamat-IP:port` (mis. dari HP di LAN), kamera ditutup browser —
 * hook ini mendeteksi kondisi itu dan memberi pesan solusinya.
 *
 * - `status`: off → starting → connected (hijau) | error/unsupported (merah).
 * - Deteksi **edge-triggered**: barcode yang masih "nongol" di frame tidak
 *   di-accept berulang kali — kode yang sama hanya diterima lagi setelah
 *   sempat hilang dari view, jadi barang yang dibiarkan di depan kamera
 *   tidak masuk keranjang dua kali.
 * - `onDetect` selalu dipanggil lewat ref, jadi parent bebas re-render
 *   (cart berubah) tanpa me-restart kamera.
 */
export type ScanStatus = "off" | "starting" | "connected" | "error" | "unsupported";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeDetectionLike[]>;
}
interface BarcodeDetectionLike {
  rawValue: string | null;
  format: string;
  boundingBox: DOMRectReadOnly;
}
interface ZXingReaderLike {
  decodeFromCanvas(canvas: HTMLCanvasElement): Promise<{ getText(): string | null }>;
}

/** Jeda minimal antar deteksi (detect berat; 60fps bikin UI lag). */
const DETECT_INTERVAL_MS = 250;
/** Cooldown setelah sebuah barcode diterima, cegah double-accept jiter. */
const ACCEPT_COOLDOWN_MS = 1500;

function getNativeDetectorCtor(): (new (opts?: { formats?: string[] }) => BarcodeDetectorLike) | null {
  if (typeof window === "undefined") return null;
  const BD = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof BD === "function" ? (BD as new (opts?: { formats?: string[] }) => BarcodeDetectorLike) : null;
}

function hasCameraApi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function isSecureContext(): boolean {
  return typeof window === "undefined" ? true : window.isSecureContext;
}

export function useBarcodeScanner({
  videoRef,
  onDetect,
}: {
  /** <video> target — harus sudah mounted saat start() dipanggil. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Dipanggil tiap barcode baru diterima (sudah di-dedup). */
  onDetect: (code: string) => void;
}) {
  const [status, setStatus] = useState<ScanStatus>("off");
  const [error, setError] = useState("");
  // Dukungan kamera (bukan decoder) — kamera hanya ada di secure context.
  const [cameraAvailable] = useState<boolean>(hasCameraApi);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const cooldownRef = useRef(0);
  const lastTryRef = useRef(0);
  const processingRef = useRef(false);
  // Edge-trigger: kode terakhir yang diterima + apakah sudah pernah "hilang"
  // dari view setelahnya.
  const acceptedRef = useRef<{ code: string; leftView: boolean } | null>(null);

  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stop = useCallback(() => {
    sessionRef.current++;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    acceptedRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("off");
    setError("");
  }, [videoRef]);

  const start = useCallback(async () => {
    if (!hasCameraApi()) {
      setStatus("unsupported");
      setError(
        isSecureContext()
          ? "Browser ini tidak menyediakan akses kamera (navigator.mediaDevices kosong)."
          : "Kamera hanya bisa dibuka lewat koneksi AMAN (HTTPS atau localhost). Sekarang aplikasi dibuka lewat HTTP biasa. Solusi: buka via https://… atau localhost, atau di Chrome: chrome://flags → \"Insecure origins treated as secure\" → tambahkan alamat aplikasi → restart Chrome."
      );
      return;
    }

    // Bersihkan sesi lama kalau start dipanggil ulang.
    sessionRef.current++;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const session = sessionRef.current;

    setStatus("starting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new Error("video element belum siap");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }

      // ── Siapkan decoder ──────────────────────────────────────────────
      // 1) BarcodeDetector native kalau ada; 2) ZXing (lazy-load) selain itu.
      let detect: (() => Promise<string | null>) | null = null;
      const BD = getNativeDetectorCtor();
      if (BD) {
        let detector: BarcodeDetectorLike;
        try {
          detector = new BD({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar", "qr_code"],
          });
        } catch {
          detector = new BD();
        }
        detect = async () => {
          const v = videoRef.current;
          if (!v) return null;
          const codes = await detector.detect(v);
          return codes.find((c) => c.rawValue && c.rawValue.trim())?.rawValue?.trim() ?? null;
        };
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (session !== sessionRef.current) return;
        // Assertion: signature decodeFromCanvas di versi ZXing variatif
        // (overload/hints), perilaku yang kita pakai tetap `Result.getText()`.
        const reader = new BrowserMultiFormatReader() as unknown as ZXingReaderLike;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        detect = async () => {
          const v = videoRef.current;
          if (!v || !ctx || !v.videoWidth || !v.videoHeight) return null;
          // Skala turun ke maks. 640px lebar — decode jauh lebih ringan.
          const scale = Math.min(1, 640 / v.videoWidth);
          const w = Math.round(v.videoWidth * scale);
          const h = Math.round(v.videoHeight * scale);
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          ctx.drawImage(v, 0, 0, w, h);
          try {
            const result = await reader.decodeFromCanvas(canvas);
            const text = result.getText()?.trim();
            return text || null;
          } catch {
            return null; // frame ini tidak terbaca
          }
        };
      }

      setStatus("connected");

      const tick = async () => {
        if (session !== sessionRef.current) return;
        const now = performance.now();
        if (now - lastTryRef.current >= DETECT_INTERVAL_MS && !processingRef.current && detect) {
          lastTryRef.current = now;
          let detected: string | null = null;
          processingRef.current = true;
          try {
            detected = await detect();
          } catch {
            detected = null;
          } finally {
            processingRef.current = false;
          }
          if (session !== sessionRef.current) return;

          // Kode yang diterima sebelumnya hilang dari view → tandai
          // "boleh accept lagi".
          if (detected === null && acceptedRef.current && !acceptedRef.current.leftView) {
            acceptedRef.current = { ...acceptedRef.current, leftView: true };
          }

          if (detected && now > cooldownRef.current) {
            const last = acceptedRef.current;
            const isRepeatInView = last !== null && last.code === detected && !last.leftView;
            if (!isRepeatInView) {
              cooldownRef.current = performance.now() + ACCEPT_COOLDOWN_MS;
              acceptedRef.current = { code: detected, leftView: false };
              onDetectRef.current(detected);
            }
          }
        }
        if (session === sessionRef.current) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      if (session !== sessionRef.current) return;
      const denied =
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
      const notFound = e instanceof DOMException && e.name === "NotFoundError";
      setStatus("error");
      setError(
        denied
          ? "Izin kamera ditolak. Aktifkan izin kamera di browser, lalu coba lagi."
          : notFound
            ? "Tidak ada kamera yang terdeteksi di perangkat ini."
            : "Kamera tidak bisa dibuka. Cek izin kamera di browser."
      );
    }
  }, [videoRef]);

  // Stop kamera saat komponen unmount (atau start dipanggil ulang lewat stop).
  useEffect(() => () => stop(), [stop]);

  return { status, error, supported: cameraAvailable, start, stop };
}
