// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible client (custom gateway). Plain fetch, no SDK.
//
//   POST {base_url}/chat/completions
//   Authorization: Bearer {api_key}
//
// Batas waktu WAJIB (kontrak eliminasi 502):
//   - connect  ≤ CONNECT_TIMEOUT_MS  (sebelum response header tiba)
//   - idle     ≤ IDLE_TIMEOUT_MS     (antar chunk stream / sampai body selesai)
// Semua fetch memakai AbortController; fetch yang hang tidak boleh membuat
// route handler menggantung (hang = sumber 502 klasik dari proxy/platform).
//
// API key dipakai server-side only, di-resolve PER REQUEST dari Supabase
// (lihat resolveLlmConfig), dan tidak pernah muncul di respons atau log.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../schemas/validate";
import {
  type AiProviderRow,
  type AiSettingsRow,
  type ChatMessage,
  type LlmConfig,
  type LlmErrorMeta,
  type LlmResult,
  type LlmToolDef,
  type ProviderModel,
  type ResolveConfigResult,
  LlmError,
} from "./types";

// Re-exported so consumers can catch/inspect LlmError via the client module.
export { LlmError } from "./types";

// 30 detik untuk byte pertama: gateway model lambat (mis. model yang
// "berpikir" sebelum byte pertama, atau antrean provider) sering butuh
// >10 detik untuk header — limit 10s membuat giliran valid gagal terus.
// idle 60s tetap menjaga route handler dari hang (sumber 502).
export const CONNECT_TIMEOUT_MS = 30_000;
export const IDLE_TIMEOUT_MS = 60_000;

function endpointFor(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

// ─── AbortController dengan fase connect/idle ───────────────────────────────

interface TimedCtl {
  ctrl: AbortController;
  /** Hapus timer connect + listener (dipanggil setelah header response tiba). */
  dispose(): void;
}

function startConnectCtl(externalSignal?: AbortSignal): TimedCtl {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("connect"), CONNECT_TIMEOUT_MS);

  let onExternalAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      ctrl.abort("external");
    } else {
      onExternalAbort = () => ctrl.abort("external");
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    ctrl,
    dispose: () => {
      clearTimeout(timer);
      if (onExternalAbort) externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function abortLlmError(t: TimedCtl): LlmError {
  const reason = String(t.ctrl.signal.reason ?? "");
  if (reason === "external") {
    return new LlmError("Permintaan dibatalkan (klien berhenti).", "UNKNOWN");
  }
  if (reason === "idle") {
    return new LlmError(
      `Stream provider berhenti mengalir lebih dari ${IDLE_TIMEOUT_MS / 1000} detik.`,
      "TIMEOUT",
      { phase: "idle" },
    );
  }
  return new LlmError(
    `Provider tidak merespons dalam ${CONNECT_TIMEOUT_MS / 1000} detik. Periksa Base URL / koneksi.`,
    "TIMEOUT",
    { phase: "connect" },
  );
}

function networkLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort|timeout/i.test(msg)) {
    return new LlmError("Model tidak merespons (timeout).", "TIMEOUT", { phase: "connect" });
  }
  return new LlmError("Tidak dapat terhubung ke provider AI.", "NETWORK");
}

/**
 * Jalankan `p` dengan watchdog idle IDLE_TIMEOUT_MS. Jika macet, abort
 * koneksi dan reject dengan LlmError TIMEOUT (idle). Sisi yang kalah di-
 * swallow agar tidak menjadi unhandled rejection.
 */
function raceIdle<T>(p: Promise<T>, t: TimedCtl): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      t.ctrl.abort("idle");
      reject(abortLlmError(t));
    }, IDLE_TIMEOUT_MS);
  });
  const raced = Promise.race([p, watchdog]);
  p.catch(() => undefined);
  return raced.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readHttpError(res: Response, t?: TimedCtl): Promise<LlmError> {
  let detail = "";
  try {
    const body = t ? await raceIdle(res.text(), t) : await res.text();
    detail = String(body).slice(0, 500);
    try {
      const j = JSON.parse(detail) as { error?: { message?: string } | string };
      detail = typeof j.error === "string" ? j.error : j.error?.message ?? detail;
    } catch {
      // bukan JSON — pakai mentahnya (sudah dipangkas 500).
    }
  } catch {
    detail = "";
  }
  // Keep the gateway's error (useful), but never the URL with credentials.
  const meta: LlmErrorMeta = { status: res.status, detail };
  return new LlmError(
    `Model menolak permintaan (HTTP ${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}.`,
    "HTTP",
    meta,
  );
}

// ─── Satu non-streaming chat completion ─────────────────────────────────────

export async function llmChat(
  config: LlmConfig,
  messages: ChatMessage[],
  tools?: LlmToolDef[],
  externalSignal?: AbortSignal,
): Promise<LlmResult> {
  const t = startConnectCtl(externalSignal);
  if (t.ctrl.signal.aborted) {
    t.dispose();
    throw abortLlmError(t);
  }
  let res: Response;
  try {
    res = await fetch(endpointFor(config.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: "auto" as const } : {}),
      }),
      signal: t.ctrl.signal,
    });
  } catch (e) {
    if (t.ctrl.signal.aborted) throw abortLlmError(t);
    throw networkLlmError(e);
  }
  t.dispose(); // header sudah sampai — fase connect selesai
  if (!res.ok) throw await readHttpError(res, t);
  let json: { choices?: { message?: { content?: string | null; tool_calls?: unknown } }[] };
  try {
    json = (await raceIdle(res.json(), t)) as typeof json;
  } catch {
    if (t.ctrl.signal.aborted) throw abortLlmError(t);
    throw new LlmError("Respons provider tidak valid.", "PARSE");
  }
  t.dispose();
  const msg = json.choices?.[0]?.message;
  const content = typeof msg?.content === "string" ? msg.content : null;
  const toolCalls = parseToolCalls(msg?.tool_calls);
  return { content: content ?? null, toolCalls };
}

// ─── Streaming chat completion ───────────────────────────────────────────────

export async function llmChatStream(
  config: LlmConfig,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  tools?: LlmToolDef[],
  externalSignal?: AbortSignal,
): Promise<LlmResult> {
  const t = startConnectCtl(externalSignal);
  if (t.ctrl.signal.aborted) {
    t.dispose();
    throw abortLlmError(t);
  }
  let res: Response;
  try {
    res = await fetch(endpointFor(config.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        ...(tools && tools.length ? { tools, tool_choice: "auto" as const } : {}),
      }),
      signal: t.ctrl.signal,
    });
  } catch (e) {
    if (t.ctrl.signal.aborted) throw abortLlmError(t);
    throw networkLlmError(e);
  }
  t.dispose();
  if (!res.ok) throw await readHttpError(res, t);

  const reader = res.body?.getReader?.();
  if (!reader) {
    // Gateway tanpa stream body — fall back ke satu bacaan JSON (masih
    // di-watchdog idle).
    let json: { choices?: { message?: { content?: string | null; tool_calls?: unknown } }[] };
    try {
      json = (await raceIdle(res.json(), t)) as typeof json;
    } catch {
      if (t.ctrl.signal.aborted) throw abortLlmError(t);
      throw new LlmError("Respons provider tidak valid.", "PARSE");
    }
    t.dispose();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") onDelta(content);
    return {
      content: typeof content === "string" ? content : null,
      toolCalls: parseToolCalls(json.choices?.[0]?.message?.tool_calls),
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  // Sinyal akhir resmi (spesifikasi OpenAI-compatible): marker `[DONE]`
  // dan/atau `finish_reason` pada chunk terakhir. Gateway yang menutup
  // stream TANPA keduanya = jawaban terpotong (biasanya timeout internal
  // gateway) — tidak boleh diproses seolah jawaban selesai.
  let sawDone = false;
  let finishReason: string | null = null;
  // Accumulate tool-call fragments across deltas (OpenAI streams them piecemeal).
  const toolCallParts: { id: string; name: string; args: string }[] = [];

  const handleData = (data: string) => {
    if (data === "[DONE]") {
      sawDone = true;
      return;
    }
    let chunk: {
      choices?: {
        finish_reason?: string | null;
        delta?: {
          content?: string;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    const choice = chunk.choices?.[0];
    if (choice && !finishReason && typeof choice.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    const delta = choice?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content.length) {
      content += delta.content;
      onDelta(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const part = (toolCallParts[idx] ??= { id: "", name: "", args: "" });
        if (tc.id) part.id = tc.id;
        if (tc.function?.name) part.name += tc.function.name;
        if (typeof tc.function?.arguments === "string") part.args += tc.function.arguments;
      }
    }
  };

  try {
    for (;;) {
      // Tiap bacaan di-watchdog idle: stream yang macet di-abort, bukan
      // menggantung sampai killed oleh platform (sumber 502).
      const { done, value } = await raceIdle(reader.read(), t);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) handleData(line.slice(5).trim());
        }
      }
    }
  } finally {
    t.dispose();
    try {
      reader.releaseLock();
    } catch {
      // stream sudah dibatalkan — abaikan.
    }
  }

  if (!sawDone && !finishReason) {
    // Stream ditutup provider tanpa sinyal selesai — jawaban terpotong
    // di tengah jalan (gateway biasanya timeout internal). Jangan
    // dikembalikan sebagai jawaban "selesai": biarkan orkestrator
    // memancarkan event error terstruktur ke klien.
    throw new LlmError(
      "Stream provider berakhir tanpa sinyal selesai — jawaban terpotong.",
      "TRUNCATED",
      { phase: "idle" },
    );
  }

  const toolCalls = toolCallParts
    .filter((p) => p.name)
    .map((p, i) => ({
      id: p.id || `call_${i}_${Date.now()}`,
      type: "function" as const,
      function: { name: p.name, arguments: p.args || "{}" },
    }));

  return { content: content || null, toolCalls };
}

function parseToolCalls(raw: unknown): LlmResult["toolCalls"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((tc): tc is { id: string; function: { name: string; arguments: string } } =>
      typeof tc === "object" &&
      tc !== null &&
      typeof (tc as { id?: unknown }).id === "string" &&
      typeof (tc as { function?: { name?: unknown } } | null)?.function?.name === "string",
    )
    .map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : "{}",
      },
    }));
}

// ─── Deteksi "model tidak mendukung tool calling" ────────────────────────────

/** True bila provider menolak parameter `tools`/`functions` (HTTP 400). */
export function isToolUnsupported(e: unknown): boolean {
  return (
    e instanceof LlmError &&
    e.code === "HTTP" &&
    e.meta?.status === 400 &&
    /tools?|functions?/i.test(e.meta?.detail ?? "")
  );
}

// ─── Provider config (Supabase — single source of truth) ────────────────────

interface LlmSelection {
  /** Slug `provider_id` (atau UUID row) dari pilihan UI. */
  providerId?: string;
  /** Model ID dari pilihan UI. */
  modelId?: string;
}

async function findProvider(
  supabase: SupabaseClient,
  key: string,
): Promise<AiProviderRow | null> {
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("provider_id", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as AiProviderRow;
  if (isUuid(key)) {
    const { data: byId, error: e2 } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("id", key)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    return (byId as AiProviderRow | null) ?? null;
  }
  return null;
}

function toConfig(row: AiProviderRow, modelId: string): LlmConfig {
  return {
    baseUrl: row.base_url,
    apiKey: row.api_key ?? "",
    model: modelId,
    providerName: row.display_name,
    providerSlug: row.provider_id,
    modelId,
  };
}

/**
 * Resolve provider+model PER REQUEST dari Supabase (`ai_providers` +
 * `ai_settings`) — single source of truth. Urutan resolusi:
 *   1. `providerId` + `modelId` eksplisit dari pilihan UI (wajib dikirim UI
 *      baru); jika tidak ada →
 *   2. baris aktif `ai_settings` (default global yang diaktifkan admin).
 *
 * API key ikut terbaca di sini dan tidak pernah dikirim ke client.
 * Kegagalan dikembalikan sebagai structured result (bukan throw) agar route
 * chat bisa membalas event error terstruktur — bukan 5xx.
 */
export async function resolveLlmConfig(
  supabase: SupabaseClient,
  sel: LlmSelection = {},
): Promise<ResolveConfigResult> {
  const notFound = (label: string) => ({
    ok: false as const,
    code: "provider_not_found" as const,
    message: `Provider "${label}" tidak ditemukan.`,
  });
  const disabled = (name: string) => ({
    ok: false as const,
    code: "provider_disabled" as const,
    message: `Provider "${name}" sedang dinonaktifkan oleh admin.`,
  });
  const unknownModel = (model: string, provider: string) => ({
    ok: false as const,
    code: "unknown_model" as const,
    message: `Model "${model}" tidak terdaftar pada provider ${provider}.`,
  });

  try {
    // 1) Pilihan eksplisit dari UI.
    if (sel.providerId && sel.modelId) {
      const row = await findProvider(supabase, sel.providerId);
      if (!row) return notFound(sel.providerId);
      if (row.enabled === false) return disabled(row.display_name);
      const hasModel = Array.isArray(row.models) && row.models.some((m) => m.id === sel.modelId);
      if (!hasModel) return unknownModel(sel.modelId, row.display_name);
      return { ok: true, config: toConfig(row, sel.modelId) };
    }

    // 2) Fallback: baris aktif ai_settings (default yang diaktifkan admin).
    const { data: settings, error: sErr } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    const s = (settings as AiSettingsRow | null) ?? null;
    if (!s) {
      return {
        ok: false,
        code: "not_configured",
        message: "Belum ada provider & model AI yang diaktifkan.",
      };
    }
    const row = await findProvider(supabase, s.provider_id);
    if (!row) return notFound(s.provider_id);
    if (row.enabled === false) return disabled(row.display_name);
    const hasModel = Array.isArray(row.models) && row.models.some((m) => m.id === s.model_id);
    if (!hasModel) return unknownModel(s.model_id, row.display_name);
    return { ok: true, config: toConfig(row, s.model_id) };
  } catch (e) {
    console.error("[llm.resolve]", e instanceof Error ? e.message : e);
    return {
      ok: false,
      code: "internal",
      message: "Gagal membaca konfigurasi AI. Silakan coba lagi.",
    };
  }
}

// ─── Model discovery ─────────────────────────────────────────────────────────

/**
 * GET {base_url}/models — dipakai tombol "Fetch available models" dan
 * endpoint diagnostik "Tes koneksi" (timeout connect 10 detik).
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProviderModel[]> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const t = startConnectCtl(signal);
  if (t.ctrl.signal.aborted) {
    t.dispose();
    throw abortLlmError(t);
  }
  let res: Response;
  try {
    res = await fetch(`${base}/models`, {
      headers: {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: t.ctrl.signal,
    });
  } catch (e) {
    if (t.ctrl.signal.aborted) throw abortLlmError(t);
    throw networkLlmError(e);
  }
  t.dispose();
  if (!res.ok) throw await readHttpError(res, t);
  let json: { data?: { id?: string; name?: string; display_name?: string }[] };
  try {
    json = (await raceIdle(res.json(), t)) as typeof json;
  } catch {
    if (t.ctrl.signal.aborted) throw abortLlmError(t);
    throw new LlmError("Respons provider tidak valid.", "PARSE");
  }
  t.dispose();
  if (!Array.isArray(json.data)) throw new LlmError("Respons provider tidak dikenali.", "PARSE");
  return json.data
    .filter((m): m is { id: string; name?: string; display_name?: string } => typeof m.id === "string")
    .map((m) => ({ id: m.id, display_name: m.display_name ?? m.name }));
}
