/* Uji lapisan approval: fingerprint, risk map, consume lifecycle. */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approvalFingerprint,
  canonicalJson,
  consumeApproval,
  createApproval,
  requiresApproval,
  riskOf,
} from "@/lib/agent/permissions/approval";
import type { AgentUser } from "@/lib/agent/types";
import { MockSupabase, type Row } from "@/lib/__tests__/mocks/mock-supabase";

const USER_A: AgentUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" };
const USER_B: AgentUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "staff" };

function approvalRow(
  partial: Partial<Row> = {},
): Row {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: USER_A.id,
    tool_name: "delete_product",
    params: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddddd" },
    fingerprint: approvalFingerprint(USER_A.id, "delete_product", {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddddd",
    }),
    summary: "Hapus produk",
    impact: "1 produk dihapus",
    irreversible: true,
    status: "pending",
    decided_at: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    ...partial,
  };
}

function makeMock(rows: Row[] = [approvalRow()]): MockSupabase {
  const mock = new MockSupabase({ agent_approvals: rows });
  return mock;
}

describe("canonicalJson & fingerprint", () => {
  it("urutan kunci tidak mengubah fingerprint", () => {
    const a = approvalFingerprint(USER_A.id, "t", { x: 1, y: "dua" });
    const b = approvalFingerprint(USER_A.id, "t", { y: "dua", x: 1 });
    expect(a).toBe(b);
  });
  it("nilai yang berubah mengubah fingerprint", () => {
    const a = approvalFingerprint(USER_A.id, "t", { price: 50000 });
    const b = approvalFingerprint(USER_A.id, "t", { price: 60000 });
    expect(a).not.toBe(b);
  });
  it("pengguna berbeda → fingerprint berbeda (bound to user)", () => {
    const a = approvalFingerprint(USER_A.id, "t", { x: 1 });
    const b = approvalFingerprint(USER_B.id, "t", { x: 1 });
    expect(a).not.toBe(b);
  });
  it("tool berbeda → fingerprint berbeda", () => {
    const a = approvalFingerprint(USER_A.id, "delete_product", { id: "1" });
    const b = approvalFingerprint(USER_A.id, "bulk_delete_zero_stock", { id: "1" });
    expect(a).not.toBe(b);
  });
  it("nested objek konsisten", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: "x" } })).toBe(
      canonicalJson({ a: { c: "x", d: [2, 1] }, b: 1 }),
    );
  });
});

describe("risk map", () => {
  it("read tidak butuh approval", () => {
    expect(riskOf("get_product")).toBe("read");
    expect(requiresApproval("get_today_sales")).toBe(false);
    expect(requiresApproval("get_sales_summary")).toBe(false);
  });
  it("safe write default tanpa approval (bisa di-escalate via env)", () => {
    expect(requiresApproval("create_product")).toBe(false);
    expect(requiresApproval("update_product")).toBe(false);
    expect(requiresApproval("update_stock")).toBe(false);
  });
  it("sensitive write wajib approval", () => {
    expect(riskOf("delete_product")).toBe("sensitive_write");
    expect(requiresApproval("delete_product")).toBe(true);
  });
  it("dangerous wajib approval", () => {
    expect(riskOf("bulk_delete_zero_stock")).toBe("dangerous");
    expect(requiresApproval("bulk_delete_zero_stock")).toBe(true);
  });
  it("tool tak dikenal dianggap read (fail-safe untuk query)", () => {
    expect(riskOf("not_a_tool")).toBe("read");
  });
});

describe("createApproval", () => {
  it("menyimpan record pending dengan fingerprint params", async () => {
    const mock = makeMock([]);
    const res = await createApproval(mock as unknown as SupabaseClient, USER_A, {
      toolName: "delete_product",
      params: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddddd" },
      summary: "Hapus produk",
      impact: "1 produk dihapus permanen",
      irreversible: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.status).toBe("pending");
    expect(res.record.fingerprint).toBe(
      approvalFingerprint(USER_A.id, "delete_product", { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddddd" }),
    );
  });
});

describe("consumeApproval", () => {
  it("approve record pending milik user → kembalikan params tersimpan", async () => {
    const mock = makeMock();
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "approve",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.params).toEqual({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddddd" });
    const row = mock.tables["agent_approvals"][0];
    expect(row.status).toBe("approved");
    expect(row.decided_at).toBeTruthy();
  });

  it("reject record pending", async () => {
    const mock = makeMock();
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "reject",
    );
    expect(res.ok).toBe(true);
    expect(mock.tables["agent_approvals"][0].status).toBe("rejected");
  });

  it("record milik user lain ditolak (FORBIDDEN)", async () => {
    const mock = makeMock();
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_B,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "approve",
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("FORBIDDEN");
  });

  it("record yang sudah diproses tidak bisa dipakai ulang (STATE)", async () => {
    const mock = makeMock([approvalRow({ status: "approved" })]);
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "approve",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("STATE");
  });

  it("record kedaluwarsa → EXPIRED + ditandai expired", async () => {
    const mock = makeMock([
      approvalRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    ]);
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "approve",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EXPIRED");
    expect(mock.tables["agent_approvals"][0].status).toBe("expired");
  });

  it("fingerprint tak cocok dengan params (tampered) → FINGERPRINT + dibatalkan", async () => {
    const row = approvalRow();
    // Simulasikan params diubah setelah record dibuat.
    row.params = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
    const mock = makeMock([row]);
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "approve",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FINGERPRINT");
    expect(mock.tables["agent_approvals"][0].status).toBe("cancelled");
  });

  it("record tak ditemukan → NOT_FOUND", async () => {
    const mock = makeMock([]);
    const res = await consumeApproval(
      mock as unknown as SupabaseClient,
      USER_A,
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "approve",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
  });
});
