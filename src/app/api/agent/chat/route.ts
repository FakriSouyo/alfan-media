import type { NextRequest } from "next/server";
import { runLlmTurn } from "@/lib/agent/llm/orchestrator";
import { resolveLlmConfig } from "@/lib/agent/llm/client";
import { sanitizeContext } from "@/lib/agent/context";
import { sseResponse, sseEventsResponse } from "@/lib/agent/sse";
import { requireAgentUser } from "@/lib/agent/supabase";
import { adminConfigClient } from "@/lib/supabase/admin";
import type { AgentEvent } from "@/lib/agent/types";

export const runtime = "nodejs";

// Batas hidup route (dihormati platform serverless; di Node self-host
// diabaikan). Mencegah platform membunuh handler yang menggantung → 502.
export const maxDuration = 120;

const MAX_MESSAGE_LENGTH = 4000;

/**
 * POST /api/agent/chat
 *
 * Body: { message, context?, providerId?, modelId? }
 *
 * Kontrak:
 *   - provider+model di-resolve PER REQUEST dari Supabase (ai_providers +
 *     ai_settings) — single source of truth, sama dengan model picker UI.
 *   - API key provider tidak pernah ke client; perubahan key di tabel
 *     terpakai pada chat berikutnya TANPA restart server.
 *   - Kegagalan LLM/provider BUKAN 5xx: selalu event `error` terstruktur
 *     di dalam stream SSE (200). 5xx hanya untuk kegagalan di luar handler.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgentUser();
    if (!auth.ok) {
      // Kegagalan autentikasi (bukan masalah LLM) — boleh 401/403.
      return Response.json({ error: auth.message }, { status: auth.status });
    }

    let body: {
      message?: unknown;
      context?: unknown;
      providerId?: unknown;
      modelId?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return sseEventsResponse([
        { type: "error", code: "invalid-message", message: "Body request tidak valid." },
      ]);
    }

    const message =
      typeof body.message === "string" ? body.message.slice(0, MAX_MESSAGE_LENGTH) : "";
    if (!message.trim()) {
      return sseEventsResponse([
        { type: "error", code: "invalid-message", message: "Message tidak boleh kosong." },
      ]);
    }

    const providerId =
      typeof body.providerId === "string" && body.providerId.trim()
        ? body.providerId.trim()
        : undefined;
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : undefined;
    const context = sanitizeContext(body.context);

    // Resolve provider+model PER REQUEST dari Supabase. Kegagalan
    // (provider tidak ada/disabled, model tak dikenal, belum dikonfigurasi)
    // keluar sebagai event error terstruktur — bukan crash/5xx.
    // Client service-role dipakai bila tersedia; fallback session user.
    const resolved = await resolveLlmConfig(adminConfigClient(auth.supabase), {
      providerId,
      modelId,
    });
    if (!resolved.ok) {
      const isAdmin = auth.user.role === "admin";
      const hint =
        resolved.code === "not_configured" || resolved.code === "provider_not_found"
          ? isAdmin
            ? " Buka Pengaturan (tab AI) untuk mengatur provider & model."
            : " Hubungi admin toko untuk mengatur AI."
          : "";
      const eventCode: Extract<AgentEvent, { type: "error" }>["code"] =
        resolved.code === "unknown_model" ? "unknown-model" : resolved.code;
      return sseEventsResponse([
        { type: "error", code: eventCode, message: resolved.message + hint },
      ]);
    }

    return sseResponse(async (emit, { signal }) => {
      const send = (event: AgentEvent) => emit(event.type, event);
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          emit("done", {});
        }
      };
      try {
        await runLlmTurn({
          message,
          context,
          user: auth.user,
          supabase: auth.supabase,
          emit: send,
          config: resolved.config,
          signal,
        });
      } finally {
        finish();
      }
    });
  } catch (e) {
    // Tidak ada throw yang lolos dari POST: bahkan bug server pun keluar
    // sebagai event error terstruktur di stream (200), bukan 5xx.
    console.error("[agent.chat]", e);
    return sseEventsResponse([
      {
        type: "error",
        code: "internal",
        message: "Terjadi kesalahan tak terduga saat memproses permintaan. Silakan coba lagi.",
      },
    ]);
  }
}
