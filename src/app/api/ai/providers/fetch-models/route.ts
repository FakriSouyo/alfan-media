import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/agent/ai-config";
import { fetchProviderModels, LlmError } from "@/lib/agent/llm/client";
import type { ProviderModel } from "@/lib/agent/llm/types";

export const runtime = "nodejs";

/**
 * POST — Fetch available models untuk provider yang BELUM disimpan.
 * Form pengisian provider mengirim baseUrl + apiKey dari field (admin sudah
 * menyetujuinya saat mengetik); server memanggil {base}/models dan
 * mengembalikan daftar — tanpa menulis apa pun ke DB. Hasilnya disimpan ke
 * provider row hanya ketika form di-SIMPAN.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body request tidak valid." }, { status: 400 });
  }

  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim().replace(/\/+$/, "") : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("proto");
  } catch {
    return Response.json(
      { error: "Base URL tidak valid (mis. https://gateway.example/v1)." },
      { status: 400 },
    );
  }
  if (apiKey.length < 8 || apiKey.length > 300 || apiKey.startsWith("•")) {
    return Response.json(
      { error: "API key tidak valid. Isi API key asli sebelum fetch model." },
      { status: 400 },
    );
  }

  try {
    const models: ProviderModel[] = await fetchProviderModels(baseUrl, apiKey);
    return Response.json({ models });
  } catch (e) {
    if (e instanceof LlmError) {
      return Response.json({ error: e.message }, { status: 502 });
    }
    console.error("[ai.fetch-models]", e instanceof Error ? e.message : e);
    return Response.json({ error: "Gagal mengambil daftar model." }, { status: 502 });
  }
}
