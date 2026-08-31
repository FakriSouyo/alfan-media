// ─────────────────────────────────────────────────────────────────────────────
// Server-Sent Events (de)serialization for the agent stream.
//
// Kontrak eliminasi 502:
//   - Stream SELALU ditutup (close) di `finally` — tidak ada half-open.
//   - Jika klien berhenti (stop/disconnect), `cancel()` meng-abort kerja
//     server (fetch LLM / tool) lewat `ctx.signal` — server tidak membakar
//     sumber daya sampai platform membunuhnya (sumber 502 di serverless).
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentEvent } from "./types";

export function sseEncode(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export interface SseProduceContext {
  /** Abort ketika klien memutus stream (stop button / disconnect). */
  signal: AbortSignal;
}

/** Wrap an async producer into an SSE ReadableStream response. */
export function sseResponse(
  produce: (emit: (type: string, data: unknown) => void, ctx: SseProduceContext) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const turn = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (type: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(type, data)));
        } catch {
          closed = true;
        }
      };
      try {
        await produce(emit, { signal: turn.signal });
      } catch (err) {
        console.error("[agent.sse]", err);
        emit("error", {
          code: "internal",
          message: "Terjadi kesalahan tak terduga saat memproses permintaan. Silakan coba lagi.",
        });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            closed = true;
          }
        }
      }
    },
    cancel() {
      // Klien berhenti — abort semua kerja turunan (fetch LLM, tool).
      // Emit lanjutan dijamin no-op oleh `closed` di atas.
      turn.abort();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * SSE response berisi daftar event terstruktur + `done` — untuk kegagalan
 * yang terdeteksi SEBELUM giliran LLM dimulai (provider tidak ada/disabled,
 * model tak dikenal, pesan kosong, dst). Status tetap 200: kegagalan LLM
 * bukan 5xx.
 */
export function sseEventsResponse(events: AgentEvent[]): Response {
  const all: { type: string; data: unknown }[] = [
    ...events.map((e) => ({ type: e.type, data: e })),
    { type: "done", data: {} },
  ];
  const body = all.map((e) => sseEncode(e.type, e.data)).join("");
  return new Response(body, { headers: SSE_HEADERS });
}
