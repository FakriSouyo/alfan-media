import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/agent/ai-config";
import type { AiProviderRow, AiSettingsRow } from "@/lib/agent/llm/types";

export const runtime = "nodejs";

function mask(p: AiProviderRow) {
  return {
    id: p.id,
    provider_id: p.provider_id,
    display_name: p.display_name,
    base_url: p.base_url,
    models: p.models,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const { data: settings } = await auth.supabase.from("ai_settings").select("*").limit(1);
  const s = (settings as AiSettingsRow[] | null)?.[0] ?? null;
  if (!s) return Response.json({ active: null });

  const { data: providers } = await auth.supabase
    .from("ai_providers")
    .select("*")
    .eq("provider_id", s.provider_id)
    .limit(1);
  const p = (providers as AiProviderRow[] | null)?.[0] ?? null;
  if (!p) return Response.json({ active: null });

  return Response.json({
    active: {
      provider: mask(p),
      model_id: s.model_id,
      updated_at: s.updated_at,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: { provider_id?: unknown; model_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body request tidak valid." }, { status: 400 });
  }
  const providerId = typeof body.provider_id === "string" ? body.provider_id.trim() : "";
  const modelId = typeof body.model_id === "string" ? body.model_id.trim() : "";
  if (!providerId || !modelId) {
    return Response.json(
      { error: "provider_id dan model_id wajib diisi." },
      { status: 400 },
    );
  }
  if (modelId.length > 160) {
    return Response.json({ error: "Model ID terlalu panjang." }, { status: 400 });
  }

  const { data: provider } = await auth.supabase
    .from("ai_providers")
    .select("id")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!provider) {
    return Response.json({ error: "Provider tidak ditemukan." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("ai_settings")
    .upsert(
      { id: 1, provider_id: providerId, model_id: modelId, updated_at: now },
      { onConflict: "id" },
    );
  if (error) return Response.json({ error: "Gagal menyimpan pengaturan aktif." }, { status: 500 });

  return Response.json({ active: { provider_id: providerId, model_id: modelId, updated_at: now } });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  const { error } = await auth.supabase.from("ai_settings").delete().eq("id", 1);
  if (error) return Response.json({ error: "Gagal menghapus pengaturan aktif." }, { status: 500 });
  return Response.json({ ok: true });
}
