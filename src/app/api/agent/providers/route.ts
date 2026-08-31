import { requireAgentUser } from "@/lib/agent/supabase";
import { adminConfigClient } from "@/lib/supabase/admin";
import type { AiProviderRow, AiSettingsRow } from "@/lib/agent/llm/types";

export const runtime = "nodejs";

/**
 * GET /api/agent/providers — sumber model picker di halaman AI Assistant.
 *
 * Semua user terautentikasi boleh membaca DAFTAR provider (tanpa api_key)
 * agar model picker berfungsi; RLS admin-only pada ai_providers diakali
 * dengan client service-role di server. Kolom `api_key` TIDAK PERNAH
 * dikirim ke browser — hanya `hasKey` (boolean).
 *
 * Hanya provider yang `enabled` yang tampil; baris `ai_settings` (default
 * global) ditandai `active` sebagai pilihan awal picker.
 */
export async function GET() {
  const auth = await requireAgentUser();
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }

  const admin = adminConfigClient(auth.supabase);
  const { data: providers, error } = await admin
    .from("ai_providers")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) {
    return Response.json({ error: "Gagal membaca provider." }, { status: 500 });
  }
  // Filter `enabled` dilakukan di aplikasi (bukan query DB) agar endpoint
  // tetap berfungsi SEBELUM migration 010 (kolom enabled) dijalankan —
  // baris tanpa kolom dianggap aktif.
  const enabledProviders = ((providers as AiProviderRow[] | null) ?? []).filter(
    (p) => p.enabled !== false,
  );

  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (sErr) {
    return Response.json({ error: "Gagal membaca pengaturan AI." }, { status: 500 });
  }
  const active = (settings as AiSettingsRow | null) ?? null;
  const activeProvider = active
    ? (enabledProviders.find((p) => p.provider_id === active.provider_id) ?? null)
    : null;

  return Response.json({
    providers: enabledProviders.map((p) => ({
      id: p.id,
      providerId: p.provider_id,
      displayName: p.display_name,
      hasKey: Boolean(p.api_key),
      models: (p.models ?? []).map((m) => ({
        id: m.id,
        display_name: m.display_name ?? undefined,
      })),
    })),
    active:
      active && activeProvider
        ? { providerId: active.provider_id, modelId: active.model_id }
        : null,
  });
}
