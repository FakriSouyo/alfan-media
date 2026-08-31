import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/agent/ai-config";
import { fetchProviderModels, LlmError } from "@/lib/agent/llm/client";
import type { AiProviderRow } from "@/lib/agent/llm/types";
import { isUuid } from "@/lib/agent/schemas/validate";

export const runtime = "nodejs";

/**
 * POST /api/ai/providers/[id]/test — "Tes koneksi" (alat debugging 502).
 *
 * Memisahkan "endpoint LLM tidak bisa dijangkau / key salah" dari
 * "jalur chat rusak": server memanggil GET {base_url}/models dengan API
 * key tersimpan (timeout connect 10 detik) dan membalas diagnostik.
 *
 * Body opsional: { models?: string[] } — jika diberikan, hasil tes juga
 * memvalidasi daftar model yang tersimpan (kembali `missingModels`).
 *
 * Kontrak respons:
 *   - provider tidak ada/disabled → 404 { error }
 *   - semua hasil tes              → 200 { ok: true, modelCount, models }
 *     atau 200 { ok: false, code: 'auth-failed'|'unreachable'|'bad-listing', message }
 *   - api_key TIDAK PERNAH muncul di respons atau log
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/ai/providers/[id]/test">,
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
  if (!provider) {
    return Response.json({ error: "Provider tidak ditemukan." }, { status: 404 });
  }
  // `=== false` (bukan `!enabled`): baris tanpa kolom `enabled`
  // (migration 010 belum dijalankan) dianggap aktif.
  if (provider.enabled === false) {
    return Response.json({ error: "Provider sedang dinonaktifkan." }, { status: 404 });
  }

  // Opsional: validasi daftar model form terhadap daftar live.
  let body: { models?: unknown } = {};
  try {
    body = (await _req.json()) as { models?: unknown };
  } catch {
    body = {};
  }
  const wanted = Array.isArray(body.models)
    ? body.models.filter((m): m is string => typeof m === "string" && m.trim().length > 0).slice(0, 200)
    : null;

  try {
    const models = await fetchProviderModels(provider.base_url, provider.api_key ?? "");
    const missing = wanted
      ? wanted.filter((w) => !models.some((m) => m.id === w))
      : undefined;
    return Response.json({
      ok: true,
      modelCount: models.length,
      models: models.slice(0, 200).map((m) => ({ id: m.id, name: m.display_name ?? m.id })),
      ...(missing !== undefined ? { missingModels: missing } : {}),
    });
  } catch (e) {
    if (e instanceof LlmError) {
      if (e.code === "TIMEOUT") {
        return Response.json({
          ok: false,
          code: "unreachable",
          message: `Provider tidak merespons dalam ${Math.round(10000 / 1000)} detik. Periksa Base URL dan koneksi.`,
        });
      }
      if (e.code === "NETWORK") {
        return Response.json({
          ok: false,
          code: "unreachable",
          message: "Endpoint tidak dapat dijangkau. Periksa Base URL (harus http/https).",
        });
      }
      if (e.code === "HTTP") {
        const status = e.meta?.status;
        if (status === 401 || status === 403) {
          return Response.json({
            ok: false,
            code: "auth-failed",
            message: `API key ditolak oleh provider (HTTP ${status}).`,
          });
        }
        return Response.json({
          ok: false,
          code: "bad-listing",
          message: `Endpoint /models menjawab HTTP ${status ?? "error"}.`,
        });
      }
      return Response.json({ ok: false, code: "bad-listing", message: e.message });
    }
    console.error("[ai.providers.test]", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, code: "bad-listing", message: "Gagal menguji koneksi." });
  }
}
