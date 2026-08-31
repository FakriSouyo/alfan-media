/* Uji client LLM (OpenAI-compatible) dengan fetch mock. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchProviderModels,
  llmChat,
  llmChatStream,
  resolveLlmConfig,
  LlmError,
} from "@/lib/agent/llm/client";
import { MockSupabase, type Row } from "@/lib/__tests__/mocks/mock-supabase";
import type { LlmConfig } from "@/lib/agent/llm/types";

const CONFIG: LlmConfig = {
  baseUrl: "https://gateway.example/v1",
  apiKey: "sk-test-key-123",
  model: "test-model",
  providerName: "Test",
  providerSlug: "test-gateway",
  modelId: "test-model",
};

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("llmChat (non-stream)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mengembalikan content", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("test-model");
      expect(body.stream).toBeUndefined();
      return jsonResponse({
        choices: [{ message: { content: "Halo, ada 3 produk stok menipis.", tool_calls: null } }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await llmChat(CONFIG, [{ role: "user", content: "stok rendah?" }]);
    expect(res.content).toBe("Halo, ada 3 produk stok menipis.");
    expect(res.toolCalls).toEqual([]);
    // API key dikirim sebagai Bearer, bukan di body.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test-key-123");
    expect(String(init.body)).not.toContain("sk-test-key-123");
  });

  it("mengembalikan tool_calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "get_today_sales", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const res = await llmChat(CONFIG, [{ role: "user", content: "penjualan hari ini?" }]);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe("get_today_sales");
    expect(res.toolCalls[0].function.arguments).toBe("{}");
  });

  it("HTTP 401 → LlmError (tanpa bocorkan key)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 })),
    );
    await expect(
      llmChat(CONFIG, [{ role: "user", content: "hi" }]),
    ).rejects.toMatchObject({ code: "HTTP" });
    try {
      await llmChat(CONFIG, [{ role: "user", content: "hi" }]);
    } catch (e) {
      expect((e as LlmError).message).toContain("401");
      expect((e as LlmError).message).not.toContain("sk-test-key-123");
      expect((e as LlmError).meta?.status).toBe(401);
    }
  });

  it("sinyal eksternal sudah ter-abort (klien stop) → tidak ada fetch ke provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      llmChat(CONFIG, [{ role: "user", content: "hi" }], undefined, aborted.signal),
    ).rejects.toBeInstanceOf(LlmError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("llmChatStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("menstream content delta dan mengumpulkan tool_calls perpotongan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.stream).toBe(true);
        const chunks = [
          'data: {"choices":[{"delta":{"content":"Penjualan "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"hari ini"}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"get_today"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"_sales"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}\n\n',
          "data: [DONE]\n\n",
        ];
        return new Response(sseBody(chunks), { status: 200 });
      }),
    );

    const deltas: string[] = [];
    const res = await llmChatStream(
      CONFIG,
      [{ role: "user", content: "penjualan hari ini?" }],
      (d) => deltas.push(d),
      [],
    );
    expect(deltas.join("")).toBe("Penjualan hari ini");
    expect(res.content).toBe("Penjualan hari ini");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe("get_today_sales");
    expect(res.toolCalls[0].id).toBe("call_9");
  });

  it("error jaringan → LlmError NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(
      llmChatStream(CONFIG, [{ role: "user", content: "hi" }], () => {}),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("stream berakhir tanpa [DONE]/finish_reason → LlmError TRUNCATED (bukan jawaban parsial diam-diam)", async () => {
    // Kasus nyata: gateway menutup stream di tengah jawaban (timeout
    // internal) — reader done=true, tanpa marker selesai apa pun.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          sseBody([
            'data: {"choices":[{"delta":{"content":"Berikut produk dengan stok menipis (di bawah ambang"}}]}\n\n',
          ]),
          { status: 200 },
        ),
      ),
    );
    await expect(
      llmChatStream(CONFIG, [{ role: "user", content: "stok rendah?" }], () => {}),
    ).rejects.toMatchObject({ code: "TRUNCATED", message: expect.stringContaining("terpotong") });
  });

  it("stream tanpa [DONE] tapi ada finish_reason → sah (gateway yang tidak mengirim marker)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          sseBody([
            'data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          ]),
          { status: 200 },
        ),
      ),
    );
    const res = await llmChatStream(
      CONFIG,
      [{ role: "user", content: "hi" }],
      () => {},
    );
    expect(res.content).toBe("Halo");
  });
});

describe("fetchProviderModels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("menjemput daftar model dari /models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        expect(String(url)).toBe("https://gateway.example/v1/models");
        return jsonResponse({
          data: [
            { id: "gpt-4o-mini" },
            { id: "acme-large", name: "Acme Large" },
          ],
        });
      }),
    );
    const models = await fetchProviderModels("https://gateway.example/v1/", "sk-x");
    expect(models).toEqual([
      { id: "gpt-4o-mini", display_name: undefined },
      { id: "acme-large", display_name: "Acme Large" },
    ]);
  });
});

describe("resolveLlmConfig (single source of truth: ai_providers + ai_settings)", () => {
  const PID = "11111111-1111-4111-8111-111111111111";
  const PID2 = "22222222-2222-4222-8222-222222222222";

  function providerRow(over: Record<string, unknown> = {}) {
    return {
      id: PID,
      provider_id: "acme",
      display_name: "Acme",
      base_url: "https://acme.example/v1",
      api_protocol: "openai-completions",
      api_key: "sk-acme",
      models: [{ id: "m-1", display_name: "Model 1" }],
      enabled: true,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      ...over,
    };
  }

  function makeMock(seed: Record<string, Row[]>) {
    return new MockSupabase(seed);
  }

  it("fallback ke baris aktif ai_settings → config lengkap", async () => {
    const mock = makeMock({
      ai_settings: [{ id: 1, provider_id: "acme", model_id: "m-1", updated_at: "2026-01-01" }],
      ai_providers: [providerRow()],
    });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config).toMatchObject({
      baseUrl: "https://acme.example/v1",
      apiKey: "sk-acme",
      model: "m-1",
      providerName: "Acme",
      providerSlug: "acme",
      modelId: "m-1",
    });
  });

  it("provider+model eksplisit dari UI → dipakai apa adanya (bukan baris aktif)", async () => {
    const mock = makeMock({
      ai_settings: [{ id: 1, provider_id: "acme", model_id: "m-1", updated_at: "2026-01-01" }],
      ai_providers: [
        providerRow({
          id: PID2,
          provider_id: "b2",
          display_name: "Beta",
          api_key: "sk-beta",
          models: [{ id: "b-9" }],
        }),
      ],
    });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {
      providerId: "b2",
      modelId: "b-9",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.apiKey).toBe("sk-beta");
    expect(res.config.model).toBe("b-9");
    expect(res.config.providerSlug).toBe("b2");
  });

  it("tanpa settings → not_configured", async () => {
    const mock = makeMock({ ai_settings: [] });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {});
    expect(res).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("provider eksplisit tidak ada → provider_not_found", async () => {
    const mock = makeMock({ ai_settings: [], ai_providers: [providerRow()] });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {
      providerId: "ghost",
      modelId: "m-1",
    });
    expect(res).toMatchObject({ ok: false, code: "provider_not_found" });
  });

  it("provider dinonaktifkan → provider_disabled", async () => {
    const mock = makeMock({
      ai_settings: [{ id: 1, provider_id: "acme", model_id: "m-1", updated_at: "2026-01-01" }],
      ai_providers: [providerRow({ enabled: false })],
    });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {});
    expect(res).toMatchObject({ ok: false, code: "provider_disabled" });
  });

  it("model aktif tidak ada di daftar provider → unknown_model", async () => {
    const mock = makeMock({
      ai_settings: [{ id: 1, provider_id: "acme", model_id: "m-999", updated_at: "2026-01-01" }],
      ai_providers: [providerRow()],
    });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {});
    expect(res).toMatchObject({ ok: false, code: "unknown_model" });
  });

  it("api_key null (endpoint publik) → apiKey kosong, tetap teresolve", async () => {
    const mock = makeMock({
      ai_settings: [{ id: 1, provider_id: "acme", model_id: "m-1", updated_at: "2026-01-01" }],
      ai_providers: [providerRow({ api_key: null })],
    });
    const res = await resolveLlmConfig(mock as unknown as SupabaseClient, {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.config.apiKey).toBe("");
  });
});
