// ─────────────────────────────────────────────────────────────────────────────
// Shared emit/stream helpers + result-block builders. Used by the LLM
// orchestrator and the approval-decision flow.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ActivityStepData,
  Emit,
  NavigateAction,
  ResultBlock,
  Tone,
} from "./types";
import { formatIDR } from "./types";
import type { SalesSummary } from "./tools/sales";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stream composed text over SSE in small word chunks (real transport). */
export async function streamText(emit: Emit, text: string): Promise<void> {
  const tokens = text.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < tokens.length; i += 3) {
    emit({ type: "text", text: tokens.slice(i, i + 3).join("") });
    await sleep(6);
  }
}

export type StepEmitter = (
  id: string,
  label: string,
  status: ActivityStepData["status"],
  meta?: string,
) => void;

export function makeStepEmitter(emit: Emit): StepEmitter {
  let n = 0;
  return (id, label, status, meta) => {
    if (!id) n += 1;
    const finalId = id || `s${n}`;
    emit({ type: "activity", item: { id: finalId, type: "step", label, status, meta } });
  };
}

export function emitBlocks(emit: Emit, blocks: ResultBlock[]): void {
  for (const block of blocks) emit({ type: "block", block });
}

export async function emitTextAndBlocks(
  emit: Emit,
  text: string,
  blocks: ResultBlock[],
): Promise<void> {
  await streamText(emit, text);
  emitBlocks(emit, blocks);
}

// ─── Block builders ──────────────────────────────────────────────────────────

export function statsBlock(
  title: string | undefined,
  items: { label: string; value: string; hint?: string; tone?: Tone }[],
): ResultBlock {
  return { kind: "stats", title, items };
}

export function listBlock(
  title: string | undefined,
  rows: { id: string; label: string; sublabel?: string; value?: string; tone?: Tone }[],
): ResultBlock {
  return { kind: "list", title, rows };
}

type ActionsBlock = Extract<ResultBlock, { kind: "actions" }>;

export function actionsBlock(actions: NavigateAction[]): ActionsBlock {
  return { kind: "actions", actions };
}

export function resultBlock(
  title: string,
  status: "success" | "error" | "info",
  fields: { label: string; value: string }[],
): ResultBlock {
  return { kind: "result", title, status, fields };
}

export function clarifyBlock(
  question: string,
  candidates?: { id: string; label: string; sublabel?: string }[],
): ResultBlock {
  return { kind: "clarify", question, candidates };
}

export function filterActions(
  actions: (NavigateAction | null | undefined)[],
): ActionsBlock[] {
  const clean = actions.filter((a): a is NavigateAction => Boolean(a));
  return clean.length ? [actionsBlock(clean)] : [];
}

export function salesStats(
  s: SalesSummary,
): { label: string; value: string; hint?: string; tone?: Tone }[] {
  return [
    { label: "Transaksi", value: String(s.transactions) },
    { label: "Omzet", value: formatIDR(s.total) },
    { label: "Item Terjual", value: `${s.itemsSold} pcs` },
    { label: "Rata-rata/Transaksi", value: formatIDR(s.avgPerTransaction) },
  ];
}

export function topProductsList(rows: { name: string; quantity: number; revenue: number }[]): {
  id: string;
  label: string;
  sublabel?: string;
  value?: string;
}[] {
  return rows.map((r, i) => ({
    id: `top-${i}`,
    label: r.name,
    sublabel: `${r.quantity} terjual`,
    value: formatIDR(r.revenue),
  }));
}
