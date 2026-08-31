// ─────────────────────────────────────────────────────────────────────────────
// Risk levels + approval records.
//
// READ            → no approval
// SAFE_WRITE      → no approval (single record) — keep configurable via
//                   SAFE_WRITE_TOOLS_APPROVAL
// SENSITIVE_WRITE → approval required
// DANGEROUS       → approval required + admin role
//
// An approval is NOT a boolean flag: it is a DB record bound to
// (user, tool, canonical parameters, session time). The decision endpoint
// re-verifies the record and executes the EXACT stored parameters — a client
// can never substitute different parameters after approving.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentUser, RiskLevel } from "../types";

export interface ApprovalRecord {
  id: string;
  user_id: string;
  tool_name: string;
  params: Record<string, unknown>;
  fingerprint: string;
  summary: string;
  impact: string;
  irreversible: boolean;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  decided_at: string | null;
  created_at: string;
  expires_at: string;
}

/** 15 minutes — an approval never outlives the conversation that proposed it. */
export const APPROVAL_TTL_MS = 15 * 60 * 1000;

export type RiskForTool = (toolName: string) => RiskLevel;

// The canonical risk table. Keep in sync with tools/registry.ts.
export const TOOL_RISK: Record<string, RiskLevel> = {
  // products
  get_product: "read",
  search_products: "read",
  list_categories: "read",
  create_product: "safe_write",
  update_product: "safe_write",
  update_stock: "safe_write",
  delete_product: "sensitive_write",
  // sales / stock / reports (read)
  get_today_sales: "read",
  get_sales: "read",
  get_sales_summary: "read",
  get_top_selling_products: "read",
  get_stock: "read",
  get_low_stock_products: "read",
  get_daily_report: "read",
  get_monthly_report: "read",
  get_sales_report: "read",
  // dangerous
  bulk_delete_zero_stock: "dangerous",
};

export function riskOf(toolName: string): RiskLevel {
  return TOOL_RISK[toolName] ?? "read";
}

/** SAFE_WRITE can be escalated to require approval per deployment. */
export function requiresApproval(toolName: string): boolean {
  const risk = riskOf(toolName);
  if (risk === "sensitive_write" || risk === "dangerous") return true;
  if (risk === "safe_write") {
    return process.env.AGENT_SAFE_WRITE_REQUIRES_APPROVAL === "true";
  }
  return false;
}

export function requiresAdmin(toolName: string): boolean {
  return riskOf(toolName) === "dangerous";
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

/** Canonical JSON (sorted keys) so parameter ordering can't change the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function approvalFingerprint(userId: string, toolName: string, params: Record<string, unknown>): string {
  const payload = `${userId}|${toolName}|${canonicalJson(params)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ─── Record lifecycle (server-side, RLS-scoped to the user) ─────────────────

export type ApprovalError =
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "EXPIRED" | "STATE" | "FINGERPRINT" | "DB_ERROR"; message: string }
  | { ok: true };

export async function createApproval(
  supabase: SupabaseClient,
  user: AgentUser,
  opts: {
    toolName: string;
    params: Record<string, unknown>;
    summary: string;
    impact: string;
    irreversible: boolean;
  },
): Promise<{ ok: true; record: ApprovalRecord } | { ok: false; message: string }> {
  const fingerprint = approvalFingerprint(user.id, opts.toolName, opts.params);
  const { data, error } = await supabase
    .from("agent_approvals")
    .insert({
      user_id: user.id,
      tool_name: opts.toolName,
      params: opts.params,
      fingerprint,
      summary: opts.summary,
      impact: opts.impact,
      irreversible: opts.irreversible,
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error(`[approval.create] ${error?.message ?? "insert failed"}`);
    return { ok: false, message: "Tidak dapat menyiapkan persetujuan." };
  }
  return { ok: true, record: data as ApprovalRecord };
}

/**
 * Consume a pending approval (approve or reject). Returns the stored
 * parameters on approval — the only parameters that may be executed.
 */
export async function consumeApproval(
  supabase: SupabaseClient,
  user: AgentUser,
  approvalId: string,
  decision: "approve" | "reject",
): Promise<
  | { ok: true; record: ApprovalRecord; params: Record<string, unknown> }
  | { ok: false; code: string; message: string }
> {
  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();
  if (error) {
    console.error(`[approval.consume] ${error.message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca persetujuan." };
  }
  if (!data) return { ok: false, code: "NOT_FOUND", message: "Persetujuan tidak ditemukan." };
  const record = data as ApprovalRecord;

  // RLS already scopes rows to the owner; enforce it in code too (defense in
  // depth — the tool layer must not trust transport identity).
  if (record.user_id !== user.id) {
    return { ok: false, code: "FORBIDDEN", message: "Persetujuan ini bukan milik Anda." };
  }
  if (record.status !== "pending") {
    return { ok: false, code: "STATE", message: "Persetujuan ini sudah diproses." };
  }
  if (Date.parse(record.expires_at) < Date.now()) {
    await supabase.from("agent_approvals").update({ status: "expired" }).eq("id", record.id);
    return { ok: false, code: "EXPIRED", message: "Persetujuan kedaluwarsa. Silakan ulangi permintaan." };
  }
  // Parameters must still hash to the stored fingerprint (tamper check).
  if (approvalFingerprint(user.id, record.tool_name, record.params) !== record.fingerprint) {
    await supabase.from("agent_approvals").update({ status: "cancelled" }).eq("id", record.id);
    return { ok: false, code: "FINGERPRINT", message: "Persetujuan tidak konsisten dan dibatalkan." };
  }

  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const { error: updateError } = await supabase
    .from("agent_approvals")
    .update({ status: nextStatus, decided_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("status", "pending"); // atomic: only a still-pending row is consumed
  if (updateError) {
    console.error(`[approval.consume] ${updateError.message}`);
    return { ok: false, code: "DB_ERROR", message: "Gagal memproses keputusan persetujuan." };
  }
  if (decision === "reject") {
    return { ok: true, record: { ...record, status: "rejected" }, params: record.params };
  }
  return { ok: true, record: { ...record, status: "approved" }, params: record.params };
}
