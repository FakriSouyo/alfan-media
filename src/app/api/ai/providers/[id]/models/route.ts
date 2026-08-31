import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/agent/ai-config";
import { fetchProviderModels, LlmError } from "@/lib/agent/llm/client";
import type { AiProviderRow } from "@/lib/agent/llm/types";
import { isUuid } from "@/lib/agent/schemas/validate";

export const runtime = "nodejs";

/**
 * POST — "Fetch available models": the server calls the provider's
 * /models endpoint (using the stored API key) and saves the result to the
 * provider row. The key never reaches the browser.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/ai/providers/[id]/models">,
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "ID tidak valid." }, { status: 400 });

  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const { data } = await auth.supabase
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const provider = (data ?? null) as AiProviderRow | null;
  if (!provider) return Response.json({ error: "Provider tidak ditemukan." }, { status: 404 });

  try {
    const models = await fetchProviderModels(provider.base_url, provider.api_key ?? "");
    const { error } = await auth.supabase
      .from("ai_providers")
      .update({ models, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return Response.json({ error: "Gagal menyimpan daftar model." }, { status: 500 });
    return Response.json({ models });
  } catch (e) {
    if (e instanceof LlmError) {
      return Response.json({ error: e.message }, { status: 502 });
    }
    console.error("[ai.models]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Gagal mengambil daftar model." }, { status: 502 });
  }
}
