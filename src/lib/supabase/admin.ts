// ─────────────────────────────────────────────────────────────────────────────
// Server-only Supabase client (service-role) untuk data admin.
//
// Dipakai HANYA oleh jalur AI (baca `ai_providers` / `ai_settings`): RLS
// kedua tabel itu admin-only, padahal chat boleh dipakai user apa pun yang
// terautentikasi — jadi pembacaan konfigurasi provider dilakukan sebagai
// service-role di server, bukan sebagai session user.
//
// API key provider LLM tetap di-resolve PER REQUEST (bukan di-bake saat
// startup) dan tidak pernah dikirim ke browser.
//
// CATATAN: jika `SUPABASE_SERVICE_ROLE_KEY` belum dikonfigurasi (masih
// placeholder), caller harus memakai client session user sebagai fallback —
// lihat `hasAdminClient()`.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Key service-role dianggap terkonfigurasi jika bentuk JWT-nya valid. */
export function hasAdminClient(): boolean {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return k.startsWith("eyJ") && k.length > 100 && !k.includes("your-");
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  if (!hasAdminClient()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Konfigurasi Supabase tidak lengkap (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Client untuk membaca konfigurasi AI: service-role jika tersedia,
 * fallback ke client session user (admin bisa; staff dibatasi RLS).
 */
export function adminConfigClient(
  sessionClient: SupabaseClient,
): SupabaseClient {
  return hasAdminClient() ? createSupabaseAdminClient() : sessionClient;
}
