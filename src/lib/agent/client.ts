// ─────────────────────────────────────────────────────────────────────────────
// Client-side SSE transport for the agent stream.
// EventSource cannot POST, so we use fetch + ReadableStream and parse frames.
// ─────────────────────────────────────────────────────────────────────────────

export interface SseEvent {
  type: string;
  data: unknown;
}

/**
 * Parse as many complete SSE frames as possible from the buffer.
 * Returns the events plus the (possibly partial) remainder to keep buffering.
 */
export function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  for (;;) {
    const index = rest.indexOf("\n\n");
    if (index === -1) break;
    const frame = rest.slice(0, index);
    rest = rest.slice(index + 2);
    let type = "message";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trimStart();
    }
    if (!type && !data) continue;
    let payload: unknown = null;
    if (data) {
      try {
        payload = JSON.parse(data);
      } catch {
        payload = { raw: data };
      }
    }
    events.push({ type, data: payload });
  }
  return { events, rest };
}

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnPayload {
  message: string;
  context?: { history?: ChatHistoryEntry[] } | null;
  /** Identitas provider+model dari pilihan UI (WAJIB dikirim UI baru). */
  providerId?: string;
  modelId?: string;
}

export interface ApprovalDecisionPayload {
  decision: "approve" | "reject";
}

/** Stream a POST to an agent SSE endpoint, invoking onEvent per frame. */
export async function streamAgentPost(
  url: string,
  body: ChatTurnPayload | ApprovalDecisionPayload,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = "Permintaan gagal. Silakan coba lagi.";
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    onEvent({ type: "error", data: { message } });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    for (const event of events) onEvent(event);
  }
}
