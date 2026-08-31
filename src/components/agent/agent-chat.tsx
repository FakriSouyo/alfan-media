"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bot, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AgentActivity,
  type AgentActivityItem,
  type AgentStepStatus,
} from "@/components/agents/agent-activity";
import { ApprovalCard } from "@/components/agents/approval-card";
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageContent,
  MessageScroller,
  MessageTyping,
} from "@/components/agents/message";
import { PromptInput, type PromptModel } from "@/components/agents/prompt-input";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer";
import { TodoList, type TodoItem } from "@/components/agents/todo-list";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store-context";
import { cn } from "@/lib/utils";
import {
  streamAgentPost,
  type ChatHistoryEntry,
  type SseEvent,
} from "@/lib/agent/client";
import {
  type ResultBlock,
  ResultBlocks,
  type Candidate,
} from "./blocks";
import { AgentMarkdown } from "./markdown";

// ─── Local message model ─────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  /** Narasi SEBELUM kartu terstruktur (dikomit saat blok/approval pertama tiba). */
  preamble?: string;
  text: string;
  blocks: ResultBlock[];
  activity: AgentActivityItem[];
  todos: TodoItem[];
  approval:
    | {
        approvalId: string;
        toolName: string;
        summary: string;
        impact: string;
        parameters: { label: string; value: string }[];
        irreversible: boolean;
        state: "pending" | "submitting" | "approved" | "rejected";
      }
    | undefined;
  status: "streaming" | "complete" | "error";
  error?: string;
  /** Kode kegagalan terstruktur dari event error (mis. "auth-failed"). */
  errorCode?: string;
  notice?: { message: string; action?: { label: string; href: string } } | null;
  /** Timestamp awal turunan (untuk durasi live "working"). */
  startedAt: number;
  /** Timestamp akhir turunan (dipakai untuk durasi ringkasan). */
  endedAt?: number;
}

// ─── Model picker (sumber: GET /api/agent/providers — tanpa api_key) ─────────

interface PickerModel {
  id: string;
  display_name?: string;
}

interface PickerOption {
  providerId: string;
  displayName: string;
  models: PickerModel[];
}

function optionKey(providerId: string, modelId: string): string {
  return `${providerId}\u0000${modelId}`;
}

interface HistoryContext {
  history?: ChatHistoryEntry[];
}

interface SseEventData {
  text?: string;
  item?: { id: string; type: "step"; label: string; status: string; meta?: string };
  items?: TodoItem[];
  block?: ResultBlock;
  approval?: {
    approvalId: string;
    toolName: string;
    summary: string;
    impact: string;
    parameters: { label: string; value: string }[];
    irreversible: boolean;
  };
  context?: HistoryContext;
  message?: string;
  code?: string;
  action?: { label?: unknown; href?: unknown };
}

const QUICK_PROMPTS = [
  "Berapa penjualan hari ini?",
  "Produk apa yang stoknya rendah?",
  "Bandingkan penjualan bulan ini dan bulan lalu",
  "Tambahkan produk baru",
];

let counter = 0;
function uid(prefix = "m"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function emptyAgentMessage(): ChatMessage {
  return {
    id: uid("a"),
    role: "agent",
    preamble: "",
    text: "",
    blocks: [],
    activity: [],
    todos: [],
    approval: undefined,
    status: "streaming",
    notice: null,
    startedAt: Date.now(),
  };
}

/**
 * Komit teks yang sudah mengalir sebagai "preamble" — narasi sebelum kartu
 * (pola beUI: narasi → data → narasi akhir). Dipanggil saat blok/approval
 * pertama tiba, supaya kalimat pembuka tidak tersangkut di bawah kartu.
 */
function commitPreamble(m: ChatMessage): Partial<ChatMessage> {
  return m.text ? { preamble: `${m.preamble ?? ""}${m.text}\n\n`, text: "" } : {};
}

function mapActivityStep(
  item: {
    id: string;
    type: "step";
    label: string;
    status: string;
    meta?: string;
  },
): AgentActivityItem {
  const status: AgentStepStatus =
    item.status === "error" ? "complete" : (item.status as AgentStepStatus);
  return {
    id: item.id,
    type: "step",
    label: status === "complete" && item.status === "error" ? `${item.label} — gagal` : item.label,
    status,
    meta: item.meta,
  };
}

/**
 * Label "working" yang REALTIME dari event server, dengan prioritas:
 *   1. Tool yang SEDANG berjalan → label tool itu sendiri (terkonkret).
 *   2. Ronde LLM aktif (id `llm-rN`): teks sudah mengalir → fase menulis
 *      jawaban; belum ada teks → label fase server ("Menganalisis
 *      permintaan" / "Menganalisis hasil tool" / "Menyusun jawaban").
 *   3. Fallback generik.
 */
function workingLabel(activity: AgentActivityItem[], isWriting: boolean): string {
  for (let i = activity.length - 1; i >= 0; i -= 1) {
    const item = activity[i];
    if (item.type !== "step" || item.status !== "active") continue;
    if (item.id.startsWith("tool-")) return `${item.label}…`;
    if (item.id.startsWith("llm-")) {
      return isWriting ? "Menulis jawaban…" : `${item.label}…`;
    }
  }
  if (isWriting) return "Menulis jawaban…";
  return "Menganalisis permintaan…";
}

/** Ringkasan setelah selesai — hanya fakta yang benar terjadi, tanpa basa-basi. */
function activitySummary(items: AgentActivityItem[]): string {
  const tools = items.filter((i) => i.type === "step" && i.id.startsWith("tool-"));
  if (tools.length === 0) return "Selesai";
  return `Selesai · ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} mnt` : `${minutes} mnt ${rest} dtk`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentChat() {
  const { user } = useAuth();
  // Agent menulis DB dari sisi server — muat ulang store lokal begitu satu
  // turunan berakhir agar halaman (stok, produk, pesanan) tidak basi.
  const { refresh } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<HistoryContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Model picker: single source of truth = GET /api/agent/providers ──
  const [pickerOptions, setPickerOptions] = useState<PickerOption[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/providers", { cache: "no-store" });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "Gagal memuat daftar model.");
        }
        const data = (await res.json()) as {
          providers: PickerOption[];
          active: { providerId: string; modelId: string } | null;
        };
        if (cancelled) return;
        setPickerOptions(data.providers);
        // Pilihan awal: baris aktif (default yang diaktifkan admin);
        // fallback ke model pertama provider pertama.
        const active = data.active;
        const activeValid =
          active &&
          data.providers.some(
            (p) =>
              p.providerId === active.providerId &&
              p.models.some((m) => m.id === active.modelId),
          );
        if (activeValid && active) {
          setSelectedOption(optionKey(active.providerId, active.modelId));
          return;
        }
        for (const p of data.providers) {
          if (p.models.length > 0) {
            setSelectedOption(optionKey(p.providerId, p.models[0].id));
            return;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setPickerError(e instanceof Error ? e.message : "Gagal memuat daftar model.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPair = useMemo(() => {
    if (!selectedOption) return null;
    const idx = selectedOption.indexOf("\u0000");
    if (idx === -1) return null;
    return { providerId: selectedOption.slice(0, idx), modelId: selectedOption.slice(idx + 1) };
  }, [selectedOption]);

  // Pilihan model untuk composer (gaya BeUI: pemilih model hidup di
  // PromptInput, bukan di header). Jika ada >1 provider, label diberi
  // awalan nama provider agar tidak ambigu.
  const promptModels = useMemo<PromptModel[]>(() => {
    if (!pickerOptions) return [];
    const multi = pickerOptions.length > 1;
    const out: PromptModel[] = [];
    for (const p of pickerOptions) {
      for (const m of p.models) {
        const name = m.display_name ?? m.id;
        out.push({
          value: optionKey(p.providerId, m.id),
          label: multi ? `${p.displayName} · ${name}` : name,
        });
      }
    }
    return out;
  }, [pickerOptions]);

  // Jam 0,5 dtk agar durasi "working" terasa hidup (realtime).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
    setMessages((current) =>
      current.map((m) => {
        if (m.id !== id) return m;
        const next = typeof patch === "function" ? patch(m) : patch;
        return { ...m, ...next };
      }),
    );
  }, []);

  const applyEvent = useCallback(
    (msgId: string, ev: SseEvent) => {
      const data = ev.data as SseEventData | null;
      switch (ev.type) {
        case "text":
          patchMessage(msgId, (m) => ({ text: m.text + (data?.text ?? "") }));
          break;
        case "activity": {
          const item = data?.item;
          if (!item) break;
          const mapped = mapActivityStep(item);
          patchMessage(msgId, (m) => {
            const others = m.activity.filter((a) => a.id !== mapped.id);
            return { activity: [...others, mapped] };
          });
          break;
        }
        case "todo": {
          const items = (data?.items ?? []) as TodoItem[];
          patchMessage(msgId, { todos: items });
          break;
        }
        case "block": {
          const block = data?.block as ResultBlock | undefined;
          if (!block) break;
          patchMessage(msgId, (m) => ({
            blocks: [...m.blocks, block],
            // Teks yang sudah mengalir = narasi sebelum kartu → pindah ke
            // preamble (dirender di ATAS kartu, sesuai urutan waktu).
            ...commitPreamble(m),
          }));
          break;
        }
        case "approval": {
          const a = data?.approval;
          if (!a) break;
          patchMessage(msgId, (m) => ({
            approval: {
              approvalId: a.approvalId,
              toolName: a.toolName,
              summary: a.summary,
              impact: a.impact,
              parameters: a.parameters,
              irreversible: a.irreversible,
              state: "pending",
            },
            ...commitPreamble(m),
          }));
          break;
        }
        case "context":
          if (data?.context) historyRef.current = data.context as HistoryContext;
          else historyRef.current = null;
          break;
        case "notice":
          patchMessage(msgId, {
            notice: {
              message: typeof data?.message === "string" ? data.message : "",
              action:
                data?.action?.label && data?.action?.href
                  ? { label: String(data.action.label), href: String(data.action.href) }
                  : undefined,
            },
          });
          break;
        case "error":
          patchMessage(msgId, {
            status: "error",
            error: data?.message ?? "Terjadi kesalahan.",
            errorCode: typeof data?.code === "string" ? data.code : undefined,
          });
          break;
        case "done":
          patchMessage(msgId, (m) =>
            m.status === "streaming" ? { status: "complete", endedAt: Date.now() } : {},
          );
          break;
        default:
          break;
      }
    },
    [patchMessage],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);
      const userMsg: ChatMessage = {
        id: uid("u"),
        role: "user",
        text,
        blocks: [],
        activity: [],
        todos: [],
        approval: undefined,
        status: "complete",
        startedAt: Date.now(),
      };
      const agentMsg = emptyAgentMessage();
      setMessages((current) => [...current, userMsg, agentMsg]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamAgentPost(
          "/api/agent/chat",
          {
            message: text,
            context: historyRef.current,
            // Identitas provider+model dari pilihan UI (WAJIB per kontrak:
            // server me-resolve konfigurasi per providerId, per request).
            ...(selectedPair
              ? { providerId: selectedPair.providerId, modelId: selectedPair.modelId }
              : {}),
          },
          (ev) => applyEvent(agentMsg.id, ev),
          controller.signal,
        );
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          patchMessage(agentMsg.id, {
            status: "error",
            error: "Koneksi terputus. Silakan coba lagi.",
          });
        }
      } finally {
        patchMessage(agentMsg.id, (m) =>
          m.status === "streaming"
            ? { status: "complete", endedAt: Date.now() }
            : {},
        );
        setBusy(false);
        abortRef.current = null;
        void refresh();
      }
    },
    [applyEvent, busy, patchMessage, selectedPair, refresh],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const decideApproval = useCallback(
    async (msgId: string, approvalId: string, decision: "approve" | "reject") => {
      const approval = messages.find((m) => m.id === msgId)?.approval;
      if (!approval || approval.state !== "pending") return;
      patchMessage(msgId, (m) =>
        m.approval ? { approval: { ...m.approval, state: "submitting" } } : {},
      );
      const resultMsg = emptyAgentMessage();
      setMessages((current) => [...current, resultMsg]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamAgentPost(
          `/api/agent/approvals/${approvalId}`,
          { decision },
          (ev) => applyEvent(resultMsg.id, ev),
          controller.signal,
        );
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          patchMessage(resultMsg.id, {
            status: "error",
            error: "Koneksi terputus. Silakan coba lagi.",
          });
        }
      } finally {
        patchMessage(msgId, (m) =>
          m.approval
            ? { approval: { ...m.approval, state: decision === "approve" ? "approved" : "rejected" } }
            : {},
        );
        patchMessage(resultMsg.id, (m) =>
          m.status === "streaming"
            ? { status: "complete", endedAt: Date.now() }
            : {},
        );
        setBusy(false);
        abortRef.current = null;
        void refresh();
      }
    },
    [applyEvent, messages, patchMessage, refresh],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const hasContent = messages.length > 0;
  const isEmpty = !hasContent;
  const currentModelLabel = promptModels.find((m) => m.value === selectedOption)?.label;

  // Tinggi kolom chat = viewport dikurangi header app (h-12) — isinya
  // scroll internal, jadi layout app (sidebar + header) tetap utuh.
  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0 flex-col">
      {/* Header kolom chat (ringan) */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="size-3.5" />
          </div>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">AI Assistant</span>
            <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
              Alfan Media
            </span>
          </div>
        </div>
        {currentModelLabel ? (
          <span
            title="Model aktif — ubah lewat pemilih di kolom chat"
            className="shrink-0 truncate rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            {currentModelLabel}
          </span>
        ) : null}
      </header>

      {/* Transcript */}
      <MessageScroller
        className="min-h-0 flex-1"
        busy={busy}
        navigation="rail"
        label="Percakapan dengan AI Assistant"
        contentClassName="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-5"
      >
          {isEmpty ? (
            <EmptyState onPick={(p) => void send(p)} />
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  busy={busy}
                  now={now}
                  onCandidate={(candidate) => void send(candidate.label)}
                  onApprove={() =>
                    message.approval &&
                    void decideApproval(message.id, message.approval.approvalId, "approve")
                  }
                  onReject={() =>
                    message.approval &&
                    void decideApproval(message.id, message.approval.approvalId, "reject")
                  }
                />
              ))}
            </AnimatePresence>
          )}
        </MessageScroller>

        {/* Composer */}
        <div className="shrink-0 border-t border-border px-4 pb-3 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            {pickerOptions && pickerOptions.length === 0 && !pickerError ? (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] text-amber-700 dark:text-amber-300">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {user?.role === "admin" ? (
                  <span className="leading-relaxed">
                    Belum ada provider AI yang aktif.{" "}
                    <Link
                      href="/settings"
                      className="font-semibold underline underline-offset-2 hover:opacity-80"
                    >
                      Tambahkan di Pengaturan AI
                    </Link>
                  </span>
                ) : (
                  <span className="leading-relaxed">
                    Model AI belum diaktifkan oleh admin toko. Silakan hubungi admin
                    untuk mengatur AI Assistant.
                  </span>
                )}
              </div>
            ) : null}
            {pickerError ? (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12.5px] text-destructive">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span className="leading-relaxed">
                  Gagal memuat daftar model: {pickerError}
                </span>
              </div>
            ) : null}
            <PromptInput
              value={input}
              onValueChange={setInput}
              models={promptModels}
              model={selectedOption || undefined}
              onModelChange={setSelectedOption}
              onSubmit={(value) => void send(value)}
              loading={busy}
              onStop={stop}
              disabled={
                pickerOptions !== null &&
                (pickerOptions.length === 0 || Boolean(pickerError))
              }
              minRows={1}
              maxRows={6}
              placeholder="Tanyakan penjualan, stok, atau minta aksi… (Enter untuk kirim)"
              className="w-full"
            />
          </div>
        </div>
    </div>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function MessageRow({
  message,
  busy,
  now,
  onCandidate,
  onApprove,
  onReject,
}: {
  message: ChatMessage;
  busy: boolean;
  /** Jam "sekarang" (tick 0,5 dtk saat busy) untuk durasi live. */
  now: number;
  onCandidate: (candidate: Candidate) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (message.role === "user") {
    return (
      <Message from="user" animateIn>
        <MessageContent>
          <MessageBubble variant="solid">{message.text}</MessageBubble>
        </MessageContent>
      </Message>
    );
  }

  const streaming = message.status === "streaming";
  // Durasi turunan: live selama streaming, final setelah selesai.
  const durationSec = streaming
    ? Math.max(0, (now - message.startedAt) / 1000)
    : message.endedAt
      ? Math.max(1, (message.endedAt - message.startedAt) / 1000)
      : 0;
  // Indikator kerja tampil sepanjang turunan berjalan — bahkan sebelum
  // event pertama datang — dan setelah selesai berubah jadi ringkasan
  // yang bisa dibuka lagi: berisi jejak langkah + durasi riil, bukan
  // formalitas. Saat error, baris ini disembunyikan (pesan error sudah
  // tampil di bawah).
  const showActivity =
    streaming || (message.status !== "error" && message.activity.length > 0);
  // Titik "sedang berpikir" hanya untuk celah di awal turunan, sebelum ada
  // isi apa pun (teks, aktivitas, todo, approval, atau blok hasil).
  const showTyping =
    streaming &&
    !message.text &&
    !message.preamble &&
    message.activity.length === 0 &&
    message.todos.length === 0 &&
    !message.approval &&
    message.blocks.length === 0;
  // Data sudah tampil sebagai kartu → tabel Markdown di teks hanyalah
  // duplikasi (dihapus deterministik, tanpa mengandalkan kepatuhan model).
  const hasDataBlock = message.blocks.some(
    (b) => b.kind === "stats" || b.kind === "list" || b.kind === "table",
  );

  return (
    <Message from="assistant" animateIn>
      <MessageAvatar>
        <Bot className="size-3.5" />
      </MessageAvatar>
      <MessageContent className="max-w-full items-start">
        {message.notice ? (
          <div className="mb-2 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="leading-relaxed">{message.notice.message}</p>
                {message.notice.action ? (
                  <Link
                    href={message.notice.action.href}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-500/40 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-amber-500/15"
                  >
                    {message.notice.action.label}
                    <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {message.todos.length > 0 ? (
          <TodoList
            items={message.todos}
            open
            collapseOnComplete
            className="w-full"
          />
        ) : null}

        {showActivity ? (
          <AgentActivity
            items={message.activity}
            status={streaming ? "working" : "complete"}
            duration={durationSec}
            collapseOnComplete
            activeLabel={workingLabel(message.activity, message.text.length > 0)}
            summary={activitySummary(message.activity)}
            renderWorkingStatus={({ label }) => (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ThinkingShimmer>{label}</ThinkingShimmer>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                  {formatDuration(durationSec)}
                </span>
              </span>
            )}
            renderCompletedStatus={({ summary }) => (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="truncate">{summary}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  {formatDuration(durationSec)}
                </span>
              </span>
            )}
            className="w-full"
          />
        ) : null}

        {/* Narasi sebelum kartu (dikomit saat blok/approval pertama tiba) —
            pola beUI: narasi → data → narasi akhir. */}
        {message.preamble ? (
          <div className="w-full text-sm leading-6 text-foreground/90">
            <AgentMarkdown text={message.preamble} hideTables={hasDataBlock} />
          </div>
        ) : null}

        {message.approval ? (
          <ApprovalCard
            title={message.approval.summary}
            description={message.approval.impact}
            status={
              message.approval.state === "submitting"
                ? "submitting"
                : message.approval.state === "approved"
                  ? "approved"
                  : message.approval.state === "rejected"
                    ? "rejected"
                    : "pending"
            }
            approveLabel="Setujui"
            onApprove={onApprove}
            onReject={onReject}
            className="w-full"
          >
            {message.approval.parameters.length > 0 ? (
              <dl className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {message.approval.parameters.map((p) => (
                  <div key={p.label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{p.label}</dt>
                    <dd className="max-w-[70%] truncate font-medium">{p.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </ApprovalCard>
        ) : null}

        {/*
          Kartu terstruktur tiba SEBELUM teks final (di-emit saat tool
          selesai), jadi dirender di atas teks — urutan DOM = urutan waktu.
          Kalau teks di atas, kartu akan "meloncat turun" saat streaming
          mulai. (Pola beUI: data dulu, narasi setelahnya.)
        */}
        {message.blocks.length > 0 ? (
          <ResultBlocks
            blocks={message.blocks}
            onCandidate={onCandidate}
            interactive={!busy}
          />
        ) : null}

        {message.text || message.status === "error" ? (
          <StreamingResponse
            status={message.status === "error" ? "error" : message.status === "streaming" ? "streaming" : "complete"}
            showActions={false}
          >
            <AgentMarkdown text={message.text} hideTables={hasDataBlock} />
            {message.status === "error" ? (
              <span className="mt-2 block text-sm text-red-600 dark:text-red-400">
                {message.error}
                {message.errorCode ? (
                  <code className="ml-1.5 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-red-600 dark:text-red-400">
                    {message.errorCode}
                  </code>
                ) : null}
              </span>
            ) : null}
          </StreamingResponse>
        ) : null}

        {showTyping ? <MessageTyping label="Sedang berpikir" /> : null}
      </MessageContent>
    </Message>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"
      >
        <Sparkles className="size-6" />
      </motion.div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Halo, saya asisten AI Anda</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Tanyakan penjualan, cek stok, kelola produk, atau minta laporan — semua
          langsung dari data toko Anda.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {QUICK_PROMPTS.map((prompt, i) => (
          <motion.button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.05, duration: 0.2 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-left text-sm text-foreground/90",
              "transition-colors hover:border-ring hover:bg-muted",
            )}
          >
            {prompt}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
