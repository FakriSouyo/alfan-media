/* Uji kontrak SSE: kegagalan LLM/provider keluar sebagai event error
 * terstruktur (200 + SSE), bukan 5xx, dan frame-nya terbaca parser client. */
import { describe, expect, it } from "vitest";
import { sseEncode, sseEventsResponse, SSE_HEADERS } from "@/lib/agent/sse";
import { parseSseChunk } from "@/lib/agent/client";

describe("SSE error stream (kontrak: bukan 5xx, event terstruktur)", () => {
  it("sseEventsResponse → status 200, frame terbaca parser client, berakhiran done", async () => {
    const res = sseEventsResponse([
      {
        type: "error",
        code: "auth-failed",
        message: "API key ditolak oleh provider (HTTP 401).",
      },
    ]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    const { events, rest } = parseSseChunk(body);
    expect(rest).toBe("");
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("error");
    expect(events[0].data).toMatchObject({ type: "error", code: "auth-failed" });
    expect(String((events[0].data as { message?: string }).message)).toContain("401");
    expect(events[1].type).toBe("done");
  });

  it("header SSE anti-buffering lengkap (penting agar stream tidak menggantung)", () => {
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-cache");
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-transform");
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });

  it("sseEncode menghasilkan frame standar event/data", () => {
    const frame = sseEncode("error", { code: "unreachable", message: "gagal" });
    expect(frame).toBe(
      `event: error\ndata: ${JSON.stringify({ code: "unreachable", message: "gagal" })}\n\n`,
    );
  });
});
