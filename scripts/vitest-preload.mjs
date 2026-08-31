// Preload untuk menjalankan Vitest di lingkungan yang memblokir spawn
// sub-process dengan piped-stdio (EPERM).
//
// Penyebab: Vite (optimizeSafeRealPathSync) memanggil `exec("net use")` saat
// resolve realpath pada Windows untuk mendeteksi network drive. Sandbox
// memblokir spawn-with-pipe → EPERM dan Vitest gagal startup.
//
// Solusi: hook `fs.realpathSync.native` supaya panggilan probe PERTAMA
// melempar EISDIR. Karena `optimizeSafeRealPathSync` menelan error EISDIR
// (dianggap dir-ellebih path), ia langsung return tanpa spawn `net use`.
// Pada call berikutnya kita kembalikan implementasi asli, jadi realpath
// lain tidak terpengaruh. Worker Vitest (worker_threads) tidak terganggu.
import fs from "node:fs";

const originalNative = fs.realpathSync.native;
let hijacked = false;

fs.realpathSync.native = function hijack(pathArg) {
  if (!hijacked) {
    hijacked = true;
    // Pulihkan lebih dulu agar reuse setelah probe.
    fs.realpathSync.native = originalNative;
    // Hanya probe Vite (path direktori root) yang kita putar menjadi EISDIR.
    // Path file sungguhan tetap diproses normal — aman di semua mesin.
    let isDir = false;
    try {
      isDir = fs.statSync(String(pathArg)).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) {
      const err = new Error("EISDIR: illegal operation on a directory");
      err.code = "EISDIR";
      throw err;
    }
  }
  return originalNative.call(fs, pathArg);
};

export {};