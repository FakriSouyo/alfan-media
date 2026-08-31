// ─────────────────────────────────────────────────────────────────────────────
// Agent core types.
//
// Architecture (top → bottom):
//   Presentation (src/components/agent/*)
//     → Route handlers (src/app/api/agent/*)  — SSE transport
//       → Orchestration (src/lib/agent/llm/orchestrator.ts)
//         → LLM (external OpenAI-compatible provider, configured by admin)
//           → Tools (src/lib/agent/tools/*)  — whitelist, validated
//             → Permissions (src/lib/agent/permissions/*) — risk + approval
//               → Supabase (server client, RLS enforced)
//
// The LLM only ever proposes tool calls; every parameter is re-validated
// server-side before execution, and sensitive/dangerous tools are
// approval-gated. No arbitrary SQL, no free-form database access.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── User ────────────────────────────────────────────────────────────────────

export interface AgentUser {
  id: string;
  role: "admin" | "staff";
}

// ─── Conversation context (client → server, per turn) ────────────────────────

/** One user/assistant exchange, kept by the client for multi-turn context. */
export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface AgentCandidate {
  id: string;
  label: string;
  sublabel?: string;
}

export interface AgentContext {
  /** Recent conversation history (sanitized server-side). */
  history?: ChatHistoryEntry[];
}

// ─── Structured result blocks (server → UI, JSON-safe) ───────────────────────

export type NavigateAction = {
  type: "navigate";
  label: string;
  href: string;
  description?: string;
};

export type ResultBlock =
  | {
      kind: "stats";
      title?: string;
      items: { label: string; value: string; hint?: string; tone?: Tone }[];
    }
  | {
      kind: "list";
      title?: string;
      rows: {
        id: string;
        label: string;
        sublabel?: string;
        value?: string;
        tone?: Tone;
      }[];
    }
  | {
      kind: "table";
      title?: string;
      columns: { key: string; label: string; align?: "left" | "right" }[];
      rows: Record<string, string>[];
    }
  | {
      kind: "result";
      title: string;
      status: "success" | "error" | "info";
      fields: { label: string; value: string }[];
    }
  | { kind: "actions"; actions: NavigateAction[] }
  | {
      kind: "clarify";
      question: string;
      candidates?: AgentCandidate[];
    };

export type Tone = "default" | "positive" | "warning" | "danger";

// ─── Activity (mirrors BEUI agent-activity item data) ────────────────────────

export type ActivityStepStatus = "pending" | "active" | "complete" | "error";

export interface ActivityStepData {
  id: string;
  type: "step";
  label: string;
  status: ActivityStepStatus;
  meta?: string;
}

// ─── Todo (mirrors BEUI todo-list item data) ─────────────────────────────────

export type TodoItemStatus = "pending" | "in-progress" | "completed" | "cancelled";

export interface TodoItemData {
  id: string;
  title: string;
  status: TodoItemStatus;
  detail?: string;
}

// ─── Approval (server → UI) ──────────────────────────────────────────────────

export interface ApprovalRequestData {
  approvalId: string;
  toolName: string;
  /** Human summary of what will happen. */
  summary: string;
  /** Concrete impact, e.g. "17 produk akan dihapus permanen". */
  impact: string;
  /** Bounded, display-safe parameter snapshot. */
  parameters: { label: string; value: string }[];
  irreversible: boolean;
}

// ─── Event stream ────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: "plan"; intent: string; note?: string }
  | { type: "activity"; item: ActivityStepData }
  | { type: "todo"; items: TodoItemData[] }
  | { type: "approval"; approval: ApprovalRequestData }
  | { type: "text"; text: string }
  | { type: "block"; block: ResultBlock }
  | { type: "context"; context: AgentContext }
  | {
      type: "error";
      /**
       * Kode kegagalan terstruktur — kegagalan LLM/provider BUKAN 5xx;
       * UI menampilkan pesan ini sebagai pesan merah di dalam chat.
       */
      code:
        | "timeout"
        | "truncated"
        | "unreachable"
        | "auth-failed"
        | "unknown-model"
        | "no-tool-support"
        | "provider-error"
        | "bad-response"
        | "not_configured"
        | "provider_not_found"
        | "provider_disabled"
        | "invalid-message"
        | "unauthorized"
        | "internal";
      message: string;
    }
  | {
      type: "notice";
      message: string;
      action?: NavigateAction;
    };

export type Emit = (event: AgentEvent) => void;

// ─── Tool layer ──────────────────────────────────────────────────────────────

export type RiskLevel = "read" | "safe_write" | "sensitive_write" | "dangerous";

export type ToolErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "FORBIDDEN"
  | "DB_ERROR"
  | "CONFLICT"
  | "TIMEOUT"
  | "CANCELLATION_NOT_POSSIBLE";

export type ToolFailure = {
  ok: false;
  code: ToolErrorCode;
  /** User-safe message. Never contains credentials or raw DB details. */
  message: string;
  /** Ambiguity candidates (AMBIGUOUS only). */
  candidates?: AgentCandidate[];
};

export type ToolSuccess<T> = { ok: true; data: T };

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export interface ToolContext {
  supabase: SupabaseClient;
  user: AgentUser;
}

export interface AgentTool {
  name: string;
  description: string;
  risk: RiskLevel;
  /** DANGEROUS operations additionally require the admin role. */
  requiresAdmin?: boolean;
}

// ─── Turn input ──────────────────────────────────────────────────────────────

export interface TurnInput {
  message: string;
  context?: AgentContext;
  user: AgentUser;
  supabase: SupabaseClient;
  emit: Emit;
}

// ─── Money / number formatting (server side) ─────────────────────────────────

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatIDR(amount: number): string {
  return IDR.format(amount);
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}
