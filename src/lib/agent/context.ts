// ─────────────────────────────────────────────────────────────────────────────
// Client-supplied conversation context is UNTRUSTED input. The LLM uses it for
// multi-turn context, so we sanitize it to a strict shape: an ordered list of
// user/assistant text entries, each bounded in length. Nothing else is kept.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentContext, ChatHistoryEntry } from "./types";

const MAX_ENTRIES = 30;
const MAX_ENTRY_CHARS = 4000;

function cleanEntry(v: unknown): ChatHistoryEntry | null {
  if (typeof v !== "object" || v === null) return null;
  const e = v as Record<string, unknown>;
  if (e.role !== "user" && e.role !== "assistant") return null;
  if (typeof e.content !== "string") return null;
  const content = e.content.slice(0, MAX_ENTRY_CHARS);
  if (!content.trim()) return null;
  return { role: e.role, content };
}

export function sanitizeContext(input: unknown): AgentContext {
  if (typeof input !== "object" || input === null) return {};
  const raw = (input as { history?: unknown }).history;
  if (!Array.isArray(raw)) return {};
  const history = raw
    .map(cleanEntry)
    .filter((e): e is ChatHistoryEntry => e !== null)
    .slice(-MAX_ENTRIES);
  return history.length ? { history } : {};
}
