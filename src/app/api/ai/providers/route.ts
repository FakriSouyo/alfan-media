import type { NextRequest } from "next/server";
import { maskApiKey, requireAdmin, validateProviderInput } from "@/lib/agent/ai-config";
import type { AiProviderRow } from "@/lib/agent/llm/types";

export const runtime = "nodejs";

function maskRow(p: AiProviderRow) {
  // Kolom api_key selalu ter-mask; `hasKey` memberi tahu UI tanpa membocorkan.
  const { api_key, ...rest } = p;
  return { ...rest, api_key: maskApiKey(api_key ?? ""), hasKey: Boolean(api_key) };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  const { data, error } = await auth.supabase
    .from("ai_providers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: "Gagal membaca provider." }, { status: 500 });
  return Response.json({ providers: (data ?? []).map(maskRow) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: Parameters<typeof validateProviderInput>[0];
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body request tidak valid." }, { status: 400 });
  }
  const v = validateProviderInput(body, { requireKey: true });
  if (!v.ok) return Response.json({ error: "Data tidak valid.", errors: v.errors }, { status: 400 });
  const { providerId, displayName, baseUrl, apiKey, models } = v.value;

  // Provider ID is unique.
  const { data: existing } = await auth.supabase
    .from("ai_providers")
    .select("id")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: "Provider ID sudah digunakan. Ganti Provider ID atau edit provider yang ada." },
      { status: 409 },
    );
  }

  const { data, error } = await auth.supabase
    .from("ai_providers")
    .insert({
      provider_id: providerId,
      display_name: displayName,
      base_url: baseUrl,
      api_protocol: "openai-completions",
      api_key: apiKey!,
      models,
    })
    .select("*")
    .single();
  if (error) return Response.json({ error: "Gagal menyimpan provider." }, { status: 500 });
  return Response.json({ provider: maskRow(data as AiProviderRow) }, { status: 201 });
}
