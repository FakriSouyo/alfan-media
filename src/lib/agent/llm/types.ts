// ─────────────────────────────────────────────────────────────────────────────
// LLM wire types + provider configuration.
//
// The agent talks to an EXTERNAL OpenAI-compatible chat-completions endpoint
// (a custom gateway) configured by the store admin in /settings. The API key
// is stored in Supabase (admin-only RLS) and used server-side only — it is
// resolved per request and never sent to the browser.
//
// Single source of truth: tabel `ai_providers` (+ `ai_settings` untuk "aktif").
// Jalur chat dan model picker membaca dari tabel yang sama.
// ─────────────────────────────────────────────────────────────────────────────

/** A model entry inside a provider's `models` jsonb array. */
export interface ProviderModel {
  id: string;
  display_name?: string;
}

export interface AiProviderRow {
  id: string;
  provider_id: string;
  display_name: string;
  base_url: string;
  api_protocol: string;
  /** Boleh null — endpoint publik tanpa key. Selalu ter-mask di respons API. */
  api_key: string | null;
  models: ProviderModel[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiSettingsRow {
  id: number;
  provider_id: string;
  model_id: string;
  updated_at: string;
}

/** Resolved, runtime config for one agent turn (server-side only). */
export interface LlmConfig {
  baseUrl: string;
  /** "" untuk endpoint publik tanpa key. */
  apiKey: string;
  model: string;
  providerName: string;
  /** Slug provider di `ai_providers.provider_id`. */
  providerSlug: string;
  modelId: string;
}

/** Hasil resolusi provider+model dari Supabase (per request). */
export type ResolveFailureCode =
  | "not_configured"
  | "provider_not_found"
  | "provider_disabled"
  | "unknown_model"
  | "internal";

export type ResolveConfigResult =
  | { ok: true; config: LlmConfig }
  | { ok: false; code: ResolveFailureCode; message: string };

// ─── OpenAI-compatible chat wire types ───────────────────────────────────────

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
}

export interface LlmToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmResult {
  content: string | null;
  toolCalls: ChatToolCall[];
}

/** Konteks kegagalan HTTP/timeout untuk pemetaan error terstruktur. */
export interface LlmErrorMeta {
  /** Status HTTP provider (hanya code "HTTP"). */
  status?: number;
  /** Detail error provider (dipangkas, tanpa kredensial). */
  detail?: string;
  /** Fase timeout: connect (sebelum header) atau idle (stream macet). */
  phase?: "connect" | "idle";
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: "HTTP" | "NETWORK" | "TIMEOUT" | "PARSE" | "TRUNCATED" | "UNKNOWN",
    public readonly meta?: LlmErrorMeta,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
