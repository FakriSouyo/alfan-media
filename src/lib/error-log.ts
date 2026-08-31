// Utility untuk serialisasi error yang konsisten.
// Di Next.js DevTools, console.error("x:", errorObject) sering menampilkan
// "x: {}" karena DevTools memfilter field. Helper ini mengubah error jadi
// string informatif yang selalu muncul jelas.

import type { PostgrestError, AuthError } from "@supabase/supabase-js";

export interface AppError {
  source: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  cause?: unknown;
}

/** Konversi error apapun jadi AppError dengan string yang jelas. */
export function toAppError(err: unknown, source: string): AppError {
  // null / undefined
  if (err == null) {
    return { source, message: "Unknown error (null)" };
  }

  // PostgrestError (Supabase DB)
  if (typeof err === "object" && err !== null) {
    const e = err as PostgrestError & AuthError & { name?: string };
    // Deteksi Supabase PostgrestError: punya .message + .code + .details
    if (typeof e.message === "string" && (e.code || e.details || e.hint)) {
      return {
        source,
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      };
    }
    // Re-cast supaya TS tidak menyempitkan ke never
    const e2 = e as unknown as Record<string, unknown>;
    // AuthError biasanya punya .name + .message
    if (typeof e2.message === "string" && typeof e2.name === "string" && /Auth|JWT|Token/i.test(e2.name)) {
      return { source, message: `${e2.name}: ${e2.message}` };
    }
    // Generic Error
    if (e instanceof Error || (typeof e2.message === "string" && typeof e2.stack === "string")) {
      return { source, message: e2.message as string };
    }
    // Last resort: inspect keys
    try {
      const keys = Object.keys(e);
      const parts = keys.map((k) => `${k}=${JSON.stringify((e as Record<string, unknown>)[k])}`);
      return { source, message: `[non-standard error] ${parts.join(", ") || "no enumerable keys"}` };
    } catch {
      return { source, message: "[unserializable error object]" };
    }
  }

  return { source, message: String(err) };
}

/** Format untuk console.warn/error. */
export function formatError(err: unknown, source: string): string {
  const a = toAppError(err, source);
  const parts = [`[${a.source}]`, a.message];
  if (a.code) parts.push(`(code=${a.code})`);
  if (a.details) parts.push(`details=${a.details}`);
  if (a.hint) parts.push(`hint=${a.hint}`);
  return parts.join(" ");
}

/** Log ke console dengan format konsisten, return null agar bisa di-chain. */
export function logError(err: unknown, source: string): null {
  console.error(formatError(err, source));
  return null;
}
