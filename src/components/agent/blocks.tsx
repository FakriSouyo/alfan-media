"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Renderers for the agent's structured result blocks.
// Block shapes mirror src/lib/agent/types.ts (kept as a local mirror so no
// server module — and no Supabase types — leak into the client bundle).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "warning" | "danger";

export interface StatItem {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}
export interface ListRow {
  id: string;
  label: string;
  sublabel?: string;
  value?: string;
  tone?: Tone;
}
export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}
export interface NavigateAction {
  type: "navigate";
  label: string;
  href: string;
  description?: string;
}
export interface Candidate {
  id: string;
  label: string;
  sublabel?: string;
}
export interface ResultBlock {
  kind: "stats" | "list" | "table" | "result" | "actions" | "clarify";
  title?: string;
  items?: StatItem[];
  rows?: (ListRow & Record<string, string>)[];
  columns?: TableColumn[];
  status?: "success" | "error" | "info";
  fields?: { label: string; value: string }[];
  actions?: NavigateAction[];
  question?: string;
  candidates?: Candidate[];
}

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

const TONE_DOT: Record<Tone, string> = {
  default: "bg-muted-foreground/40",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function BlockShell({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border bg-card/60",
        className,
      )}
    >
      {title ? (
        <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ─── stats ───────────────────────────────────────────────────────────────────

function StatsBlock({ title, items }: { title?: string; items: StatItem[] }) {
  return (
    <BlockShell title={title}>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-card px-3.5 py-3">
            <div className="text-[11px] font-medium text-muted-foreground">
              {item.label}
            </div>
            <div className={cn("mt-1 text-base font-semibold tabular-nums", TONE_VALUE[item.tone ?? "default"])}>
              {item.value}
            </div>
            {item.hint ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

// ─── list ────────────────────────────────────────────────────────────────────

function ListBlock({ title, rows }: { title?: string; rows: ListRow[] }) {
  return (
    <BlockShell title={title}>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[row.tone ?? "default"])}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{row.label}</div>
              {row.sublabel ? (
                <div className="truncate text-[11px] text-muted-foreground">{row.sublabel}</div>
              ) : null}
            </div>
            {row.value ? (
              <div className={cn("shrink-0 text-sm font-medium tabular-nums", TONE_VALUE[row.tone ?? "default"])}>
                {row.value}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </BlockShell>
  );
}

// ─── table ───────────────────────────────────────────────────────────────────

function TableBlock({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: TableColumn[];
  rows: Record<string, string>[];
}) {
  return (
    <BlockShell title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn("px-3.5 py-2 font-semibold", col.align === "right" && "text-right")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-3.5 py-2 tabular-nums", col.align === "right" && "text-right")}
                  >
                    {row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockShell>
  );
}

// ─── result ──────────────────────────────────────────────────────────────────

const RESULT_ICONS = {
  success: <CheckCircle2 className="size-4 text-emerald-500" />,
  error: <XCircle className="size-4 text-red-500" />,
  info: <Info className="size-4 text-sky-500" />,
} as const;

const RESULT_LABEL = {
  success: "Berhasil",
  error: "Gagal",
  info: "Informasi",
} as const;

function ResultBlockCard({
  title,
  status,
  fields,
}: {
  title: string;
  status: "success" | "error" | "info";
  fields: { label: string; value: string }[];
}) {
  return (
    <BlockShell>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {RESULT_ICONS[status]}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{RESULT_LABEL[status]}</span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border px-3.5 py-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {field.label}
            </span>
            <span className="min-w-0 truncate text-right font-medium tabular-nums">{field.value}</span>
          </div>
        ))}
      </div>
    </BlockShell>
  );
}

// ─── actions (deep links — hrefs come from the server whitelist) ─────────────

function ActionsBlock({ actions }: { actions: NavigateAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <Link
          key={action.href + action.label}
          href={action.href}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs font-medium transition-colors hover:border-ring hover:bg-muted"
          title={action.description}
        >
          {action.label}
          <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

// ─── clarify ─────────────────────────────────────────────────────────────────

function ClarifyBlock({
  question,
  candidates,
  onCandidate,
  disabled,
}: {
  question: string;
  candidates?: Candidate[];
  onCandidate: (candidate: Candidate) => void;
  disabled: boolean;
}) {
  return (
    <div className="w-full rounded-xl border border-dashed border-border bg-card/40 px-3.5 py-3">
      {question ? <div className="text-sm text-foreground/90">{question}</div> : null}
      {candidates && candidates.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={disabled}
              onClick={() => onCandidate(candidate)}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-ring hover:bg-muted disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{candidate.label}</span>
                {candidate.sublabel ? (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {candidate.sublabel}
                  </span>
                ) : null}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export function ResultBlocks({
  blocks,
  onCandidate,
  interactive,
}: {
  blocks: ResultBlock[];
  onCandidate: (candidate: Candidate) => void;
  interactive: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "stats":
            return <StatsBlock key={i} title={block.title} items={block.items ?? []} />;
          case "list":
            return <ListBlock key={i} title={block.title} rows={block.rows ?? []} />;
          case "table":
            return (
              <TableBlock key={i} title={block.title} columns={block.columns ?? []} rows={block.rows ?? []} />
            );
          case "result":
            return (
              <ResultBlockCard
                key={i}
                title={block.title ?? "Hasil"}
                status={block.status ?? "info"}
                fields={block.fields ?? []}
              />
            );
          case "actions":
            return <ActionsBlock key={i} actions={block.actions ?? []} />;
          case "clarify":
            return (
              <ClarifyBlock
                key={i}
                question={block.question ?? ""}
                candidates={block.candidates}
                onCandidate={onCandidate}
                disabled={!interactive}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
