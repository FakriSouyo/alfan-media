import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskApiKey, requireAdmin, validateProviderInput } from "@/lib/agent/ai-config";
import type { AiProviderRow } from "@/lib/agent/llm/types";
import { isUuid } from "@/lib/agent/schemas/validate";

export const runtime = "nodejs";

async function loadProvider(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: true as const };
  return { data: (data ?? null) as AiProviderRow | null };
}

/**
 * Cek keberadaan kolom `enabled` (migration 010). Dibuat toleran: jika
 * kolom belum ada di database, caller membalas error yang bisa ditindak
 * lanjuti — bukan 500 dari Postgres.
 */
async function hasEnabledColumn(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("ai_providers").select("enabled").limit(1);
  return error ? !/does not exist|column/i.test(error.message) : true;
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/ai/providers/[id]">,
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "ID tidak valid." }, { status: 400 });

  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const loaded = await loadProvider(auth.supabase, id);
  if (loaded.error) return Response.json({ error: "Gagal membaca provider." }, { status: 500 });
  const existing = loaded.data;
  if (!existing) return Response.json({ error: "Provider tidak ditemukan." }, { status: 404 });

  let body: Parameters<typeof validateProviderInput>[0] & { enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body request tidak valid." }, { status: 400 });
  }
  const v = validateProviderInput(
    { ...body, apiKey: body.apiKey ?? (existing.api_key ?? undefined) },
    { requireKey: false },
  );
  if (!v.ok) return Response.json({ error: "Data tidak valid.", errors: v.errors }, { status: 400 });
  const { providerId, displayName, baseUrl, apiKey, models } = v.value;

  // provider_id rename: ensure uniqueness.
  if (providerId !== existing.provider_id) {
    const { data: clash } = await auth.supabase
      .from("ai_providers")
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (clash) {
      return Response.json({ error: "Provider ID sudah digunakan." }, { status: 409 });
    }
  }

  const patch: Record<string, unknown> = {
    provider_id: providerId,
    display_name: displayName,
    base_url: baseUrl,
    updated_at: new Date().toISOString(),
  };
  if (apiKey !== undefined) patch.api_key = apiKey;
  if (models !== undefined) patch.models = models;
  if (typeof body.enabled === "boolean") {
    // Kolom `enabled` baru ada setelah migration 010 — jangan biarkan
    // write ke kolom tak dikenal menghasilkan 500.
    if (!(await hasEnabledColumn(auth.supabase))) {
      return Response.json(
        {
          error:
            "Kolom 'enabled' belum tersedia di database. Jalankan supabase/migration/010_ai_provider_enabled.sql di Supabase SQL Editor, lalu coba lagi.",
        },
        { status: 400 },
      );
    }
    patch.enabled = body.enabled;
  }

  const { data, error } = await auth.supabase
    .from("ai_providers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return Response.json({ error: "Gagal memperbarui provider." }, { status: 500 });
  const updated = data as AiProviderRow;
  return Response.json({
    provider: { ...updated, api_key: maskApiKey(updated.api_key ?? ""), hasKey: Boolean(updated.api_key) },
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/ai/providers/[id]">,
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "ID tidak valid." }, { status: 400 });

  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const loaded = await loadProvider(auth.supabase, id);
  if (loaded.error) return Response.json({ error: "Gagal membaca provider." }, { status: 500 });
  const existing = loaded.data;
  if (!existing) return Response.json({ error: "Provider tidak ditemukan." }, { status: 404 });

  // The active settings row references this provider — deactivate first.
  const { data: settings } = await auth.supabase.from("ai_settings").select("provider_id").limit(1);
  if ((settings as { provider_id: string }[] | null)?.[0]?.provider_id === existing.provider_id) {
    return Response.json(
      { error: "Provider ini sedang aktif. Nonaktifkan/ganti model aktif di Pengaturan AI dulu." },
      { status: 409 },
    );
  }

  const { error } = await auth.supabase.from("ai_providers").delete().eq("id", id);
  if (error) return Response.json({ error: "Gagal menghapus provider." }, { status: 500 });
  return Response.json({ ok: true });
}
