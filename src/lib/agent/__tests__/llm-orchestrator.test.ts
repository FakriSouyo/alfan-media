/* Uji orkestrator LLM end-to-end dengan model terskrip (fetch mock).
 * Menguji janji inti: data selalu dari tool (tidak ada angka karangan),
 * operasi sensitif selalu lewat approval, dan tidak ada klaim sukses palsu.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MockSupabase, type Row } from "@/lib/__tests__/mocks/mock-supabase";
import { runLlmTurn } from "@/lib/agent/llm/orchestrator";
import { runApprovalDecision } from "@/lib/agent/approval-decision";
import type { AgentEvent, AgentUser, ApprovalRequestData, Emit } from "@/lib/agent/types";
import type { LlmConfig } from "@/lib/agent/llm/types";

const ADMIN: AgentUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" };
const STAFF: AgentUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "staff" };

const CONFIG: LlmConfig = {
  baseUrl: "https://gateway.example/v1",
  apiKey: "sk-test",
  model: "test-model",
  providerName: "Test",
  providerSlug: "test-gateway",
  modelId: "test-model",
};

const ID = {
  c1: "11111111-1111-4111-8111-111111111111",
  p1: "22222222-2222-4222-8222-222222222222",
  p2: "22222222-2222-4222-8222-222222222223",
  p3: "22222222-2222-4222-8222-222222222224",
  pp1: "33333333-3333-4333-8333-333333333333",
} as const;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function seedDb(): Record<string, Row[]> {
  const today = iso(new Date());
  return {
    categories: [
      { id: ID.c1, name: "Matematika", level: "SMA", description: "", created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    products: [
      { id: ID.p1, name: "Algebra X", category_id: ID.c1, barcode: "8990000000011", description: "", published_year: 2025, semester: "Ganjil", stock: 10, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: ID.p2, name: "Algebra XI", category_id: ID.c1, barcode: "8990000000028", description: "", published_year: 2025, semester: "Ganjil", stock: 4, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: ID.p3, name: "English Practice", category_id: null, barcode: "8990000000035", description: "", published_year: 2026, semester: "Genap", stock: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ],
    product_prices: [
      { id: ID.pp1, product_id: ID.p1, tier_name: "Normal", price: 50000, is_default: true, created_at: "2026-01-01" },
    ],
    orders: [
      { id: "55555555-5555-4555-8555-555555555555", invoice_no: "INV-001", order_date: today, customer_id: null, customer_name: "SMA 1", subtotal: 150000, discount: 0, total: 150000, status: "COMPLETED", notes: null, created_by: null, created_at: today, updated_at: today },
    ],
    order_items: [
      { id: "66666666-6666-4666-8666-666666666666", order_id: "55555555-5555-4555-8555-555555555555", product_id: ID.p1, product_name: "Algebra X", product_barcode: "8990000000011", quantity: 3, unit_price: 50000, price_tier: "Normal", custom_price: null, discount_percent: 0, subtotal: 150000, created_at: today },
    ],
    // Ledger konsisten dengan products.stock (trigger = max(0, SUM)):
    // p1: 10, p2: 4, p3: 0 (tanpa riwayat).
    stock_movements: [
      { id: "sm-p1", product_id: ID.p1, type: "INITIAL", quantity: 10, reference: "seed", created_by: null, created_at: "2026-01-01" },
      { id: "sm-p2", product_id: ID.p2, type: "INITIAL", quantity: 4, reference: "seed", created_by: null, created_at: "2026-01-01" },
    ],
  };
}

// ─── Scripted LLM ────────────────────────────────────────────────────────────

type ScriptedResponse =
  | { kind: "content"; content: string }
  | { kind: "tool_calls"; calls: { id: string; name: string; args: Record<string, unknown> }[] };

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

function responseChunks(r: ScriptedResponse): string[] {
  if (r.kind === "content") {
    const words = r.content.split(" ");
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 2) {
      chunks.push(
        `data: {"choices":[{"delta":{"content":"${words.slice(i, i + 2).join(" ")}${i + 2 < words.length ? " " : ""}"}}]}\n\n`,
      );
    }
    chunks.push("data: [DONE]\n\n");
    return chunks;
  }
  const chunks = r.calls.map((c, i) =>
    `data: {"choices":[{"delta":{"tool_calls":[{"index":${i},"id":"${c.id}","function":{"name":"${c.name}","arguments":${JSON.stringify(JSON.stringify(c.args))}}}]}}]}\n\n`,
  );
  chunks.push("data: [DONE]\n\n");
  return chunks;
}

function installLlm(script: ScriptedResponse[]) {
  let i = 0;
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    seen.push({ url: u, body });
    if (i >= script.length) {
      throw new Error(`Script LLM habis dipanggil (${i + 1}x) — skenario test salah`);
    }
    const r = script[i++];
    return new Response(sseBody(responseChunks(r)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { seen };
}

async function runTurn(
  mock: MockSupabase,
  message: string,
  opts: { user?: AgentUser; context?: { history?: { role: "user" | "assistant"; content: string }[] } } = {},
) {
  const events: AgentEvent[] = [];
  const emit: Emit = (e) => events.push(e);
  const context = await runLlmTurn({
    message,
    context: opts.context,
    user: opts.user ?? ADMIN,
    supabase: mock as unknown as SupabaseClient,
    emit,
    config: CONFIG,
  });
  const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
  return { events, context, text };
}

describe("orkestrator LLM", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("penjualan hari ini: data dari tool, blok stats, tanpa angka karangan", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "get_today_sales", args: {} }] },
    ]);

    const { events, context, text } = await runTurn(mock, "Berapa penjualan hari ini?");

    // Fast path baca: LLM cukup 1x (routing); penutup deterministik.
    expect(seen.length).toBe(1);
    expect(text).toContain("150.000");
    const stats = events.find(
      (e): e is Extract<AgentEvent, { type: "block" }> & { block: { kind: "stats" } & { items: { label: string; value: string }[] } } =>
        e.type === "block" && e.block.kind === "stats",
    );
    expect(stats).toBeTruthy();
    if (!stats) throw new Error("stats block tidak ditemukan");
    const values = stats.block.items.map((x) => x.value);
    expect(values.some((v) => v.includes("150.000"))).toBe(true);
    // Context untuk giliran berikutnya berisi riwayat user+assistant.
    expect(context.history).toHaveLength(2);
    expect(context.history?.[0].role).toBe("user");
    expect(context.history?.[1].role).toBe("assistant");
    // Activity step hadir & selesai.
    const steps = events.filter((e) => e.type === "activity");
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it("hapus produk: approval card, DB belum berubah sebelum keputusan", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    installLlm([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "delete_product", args: { id: ID.p2 } }],
      },
      {
        kind: "content",
        content: "Saya sudah menyiapkan kartu persetujuan untuk penghapusan produk itu.",
      },
    ]);

    const { events } = await runTurn(mock, 'Hapus produk "Algebra XI"');

    const approvalEvent = events.find((e) => e.type === "approval");
    expect(approvalEvent).toBeTruthy();
    const approval = (approvalEvent as { approval: ApprovalRequestData }).approval;
    expect(approval.toolName).toBe("delete_product");
    expect(approval.summary).toContain("Algebra XI");
    expect(approval.irreversible).toBe(true);
    // DB belum berubah.
    expect(mock.tables["products"].find((p) => p.id === ID.p2)).toBeTruthy();

    // Approve → eksekusi params tersimpan.
    const events2: AgentEvent[] = [];
    await runApprovalDecision({
      approvalId: approval.approvalId,
      decision: "approve",
      user: ADMIN,
      supabase: mock as unknown as SupabaseClient,
      emit: (e) => events2.push(e),
    });
    expect(mock.tables["products"].find((p) => p.id === ID.p2)).toBeUndefined();
  });

  it("bulk delete: staff ditolak, admin mendapat approval", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;

    // Staff → FORBIDDEN.
    installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "bulk_delete_zero_stock", args: {} }] },
      { kind: "content", content: "Maaf, operasi itu hanya dapat dilakukan admin." },
    ]);
    const staffRes = await runTurn(mock, "Hapus semua produk yang stoknya 0", { user: STAFF });
    expect(staffRes.events.find((e) => e.type === "approval")).toBeFalsy();
    expect(staffRes.text.toLowerCase()).toContain("admin");
    expect(mock.tables["products"].length).toBe(3);
    expect(mock.tables["agent_approvals"] ?? []).toHaveLength(0);

    // Admin → approval.
    installLlm([
      { kind: "tool_calls", calls: [{ id: "call_2", name: "bulk_delete_zero_stock", args: {} }] },
      { kind: "content", content: "Kartu persetujuan sudah ditampilkan." },
    ]);
    const adminRes = await runTurn(mock, "Hapus semua produk yang stoknya 0", { user: ADMIN });
    const approvalEvent = adminRes.events.find((e) => e.type === "approval") as
      | { approval: ApprovalRequestData }
      | undefined;
    expect(approvalEvent).toBeTruthy();
    if (!approvalEvent) throw new Error("approval event missing");
    const approval = approvalEvent.approval;
    expect(approval.toolName).toBe("bulk_delete_zero_stock");
    expect(mock.tables["products"].length).toBe(3); // belum dieksekusi
  });

  it("tool error → model tidak boleh dibohongi; jawaban tetap jujur", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    installLlm([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "get_product", args: { id: "99999999-9999-4999-8999-999999999999" } }],
      },
      { kind: "content", content: "Produk itu tidak saya temukan di toko." },
    ]);
    const { text } = await runTurn(mock, "Bagaimana detail produk id 99999999-9999-4999-8999-999999999999?");
    expect(text).toContain("tidak saya temukan");
  });

  it("fast path: update_stock sukses → TANPA ronde LLM kedua (konfirmasi deterministik)", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    // Hanya 1 script: bila orkestrator tetap memanggil LLM ronde kedua,
    // mock akan melempar "Script LLM habis dipanggil".
    const { seen } = installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "update_stock", args: { id: ID.p2, delta: 5 } }] },
    ]);

    const { text } = await runTurn(mock, "Tambah 5 stok Algebra XI");

    expect(seen.length).toBe(1);
    expect(text).toContain("Algebra XI");
    expect(text).toContain("4** menjadi **9"); // 4 + 5 = 9
    // Stok di DB memang berubah.
    expect(mock.tables["products"].find((p) => p.id === ID.p2)).toMatchObject({ stock: 9 });
  });

  it("fast path TIDAK aktif bila tool gagal → LLM tetap diberi ronde penjelasan", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "update_stock", args: { id: "99999999-9999-4999-8999-999999999999", delta: 5 } }],
      },
      { kind: "content", content: "Produk itu tidak saya temukan di toko." },
    ]);

    const { text } = await runTurn(mock, "Tambah 5 stok produk id 99999999-9999-4999-8999-999999999999");

    expect(seen.length).toBe(2); // ronde kedua tetap terjadi (model menjelaskan kegagalan)
    expect(text).toContain("tidak saya temukan");
  });

  it("fast path baca: get_low_stock_products → TANPA ronde LLM kedua", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "get_low_stock_products", args: { threshold: 5 } }] },
    ]);

    const { text } = await runTurn(mock, "Produk apa yang stoknya rendah?");

    expect(seen.length).toBe(1);
    // Seed: p2 stok 4, p3 stok 0 → 2 produk di bawah 5.
    expect(text).toContain("2 produk");
    expect(text).toContain("5 pcs");
  });

  it("fast path baca: get_top_selling_products → TANPA ronde LLM kedua", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "get_top_selling_products", args: { period: "today" } }] },
    ]);

    const { text } = await runTurn(mock, "Produk apa yang paling laku hari ini?");

    expect(seen.length).toBe(1);
    expect(text).toContain("Produk terlaris");
    expect(text).toContain("Algebra X");
    expect(text).toContain("3 pcs");
  });

  it("fast path campur: laporan + tulis satu ronde → penutup deterministik gabungan", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      {
        kind: "tool_calls",
        calls: [
          { id: "call_1", name: "get_today_sales", args: {} },
          { id: "call_2", name: "update_stock", args: { id: ID.p2, delta: 5 } },
        ],
      },
    ]);

    const { text } = await runTurn(mock, "Penjualan hari ini, sekalian tambah 5 stok Algebra XI");

    expect(seen.length).toBe(1);
    expect(text).toContain("150.000"); // baris laporan
    expect(text).toContain("Algebra XI"); // baris konfirmasi stok
    expect(mock.tables["products"].find((p) => p.id === ID.p2)).toMatchObject({ stock: 9 });
  });

  it("fast path TIDAK aktif untuk tangga langkah (get_stock) → LLM tetap diberi ronde", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([
      { kind: "tool_calls", calls: [{ id: "call_1", name: "get_stock", args: {} }] },
      { kind: "content", content: "Ini daftar stok produk." },
    ]);

    await runTurn(mock, "Cek stok semua produk, nanti saya minta tambah");
    // get_stock sering jadi prasyarat aksi → model tetap dapat ronde lanjutan.
    expect(seen.length).toBe(2);
  });

  it("provider bermasalah (HTTP 500) → event error terstruktur, bukan klaim sukses", async () => {
    const mock = new MockSupabase(seedDb());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })),
    );
    const { events, text } = await runTurn(mock, "Berapa penjualan hari ini?");
    expect(text.trim()).toBe("");
    const err = events.find((e) => e.type === "error") as
      | { code: string; message: string }
      | undefined;
    expect(err).toBeTruthy();
    expect(err?.code).toBe("provider-error");
    expect(err?.message).toContain("500");
  });

  it("API key salah (HTTP 401) → event error auth-failed (tanpa bocorkan key)", async () => {
    const mock = new MockSupabase(seedDb());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 })),
    );
    const { events } = await runTurn(mock, "Berapa penjualan hari ini?");
    const err = events.find((e) => e.type === "error") as { code: string; message: string } | undefined;
    expect(err).toBeTruthy();
    expect(err?.code).toBe("auth-failed");
    expect(err?.message).not.toContain("sk-test");
  });

  it("endpoint menolak parameter tools (HTTP 400) → event error no-tool-support", async () => {
    const mock = new MockSupabase(seedDb());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Unrecognized request argument: tools" } }), {
          status: 400,
        }),
      ),
    );
    const { events } = await runTurn(mock, "Berapa penjualan hari ini?");
    const err = events.find((e) => e.type === "error") as { code: string; message: string } | undefined;
    expect(err).toBeTruthy();
    expect(err?.code).toBe("no-tool-support");
  });

  it("endpoint tak terjangkau (network error) → event error unreachable", async () => {
    const mock = new MockSupabase(seedDb());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const { events } = await runTurn(mock, "Berapa penjualan hari ini?");
    const err = events.find((e) => e.type === "error") as { code: string; message: string } | undefined;
    expect(err).toBeTruthy();
    expect(err?.code).toBe("unreachable");
  });

  it("klien menghentikan giliran (signal abort) → tidak ada event error", async () => {
    const mock = new MockSupabase(seedDb());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        // Simulasikan koneksi yang baru hang, lalu klien abort.
        const signal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          if (!signal) return;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }),
    );
    const events: AgentEvent[] = [];
    const ctrl = new AbortController();
    const p = runLlmTurn({
      message: "Berapa penjualan hari ini?",
      user: ADMIN,
      supabase: mock as unknown as SupabaseClient,
      emit: (e) => events.push(e),
      config: CONFIG,
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 20);
    await p;
    expect(events.find((e) => e.type === "error")).toBeFalsy();
  });

  it("giliran kedua memakai riwayat dari context", async () => {
    const mock = new MockSupabase(seedDb());
    mock.simulateDbBehavior = true;
    const { seen } = installLlm([{ kind: "content", content: "Baik, saya cek lagi untuk bulan lalu." }]);
    await runTurn(mock, "Lalu bulan lalu?", {
      context: {
        history: [
          { role: "user", content: "Berapa penjualan hari ini?" },
          { role: "assistant", content: "Penjualan hari ini Rp150.000." },
        ],
      },
    });
    expect(seen.length).toBe(1);
    const messages = seen[0].body.messages as { role: string; content?: string | null }[];
    const roles = messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[1].content).toBe("Berapa penjualan hari ini?");
    expect(messages[2].content).toBe("Penjualan hari ini Rp150.000.");
    expect(messages[3].content).toBe("Lalu bulan lalu?");
  });
});
