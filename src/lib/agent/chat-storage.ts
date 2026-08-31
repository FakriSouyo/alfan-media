// ─────────────────────────────────────────────────────────────────────────────
// Persistensi riwayat chat AI — localStorage saja (tanpa DB).
//
//   - Auto-expiry: riwayat lebih tua dari 7 hari dibuang saat dibuka.
//   - Normalisasi: turunan yang sempat "streaming" (mis. F5 di tengah
//     jawaban) direhydrate sebagai complete — teks sebagian tetap tampil.
//   - Batas ukuran: hanya N pesan terbaru disimpan; bila kuota browser
//     penuh, setua di-jatuhkan bertahap (fail-safe, tidak melempar).
//
// Catatan: state approval "pending" ikut tersimpan; server tetap sumber
// kebenaran — bila approval-nya sudah kedaluwarsa, keputusan yang dikirim
// akan dibalas error terstruktur oleh server (jujur, tidak klaim sukses).
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatMessage } from "@/components/agent/agent-chat";

const KEY = "alfan:agent-chat:v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 200;

interface StoredChat {
  savedAt: number;
  messages: ChatMessage[];
}

function normalize(m: ChatMessage): ChatMessage {
  // Sisa turunan yang belum selesai saat disimpan (F5 mid-stream).
  const status = m.status === "streaming" ? "complete" : m.status;
  const activity = m.activity.map((a) =>
    a.type === "step" && a.status === "active"
      ? { ...a, status: "complete" as const }
      : a,
  );
  return {
    ...m,
    status,
    activity,
    endedAt: status === "complete" && !m.endedAt ? m.startedAt : m.endedAt,
  };
}

/** Muat riwayat tersimpan. Mengembalikan [] bila tidak ada / kedaluwarsa / rusak. */
export function loadChatHistory(now: number = Date.now()): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredChat;
    if (
      !stored ||
      !Array.isArray(stored.messages) ||
      typeof stored.savedAt !== "number" ||
      now - stored.savedAt > WEEK_MS
    ) {
      window.localStorage.removeItem(KEY);
      return [];
    }
    return stored.messages.map(normalize);
  } catch {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // penyimpanan tidak tersedia (private mode dll.) — abaikan.
    }
    return [];
  }
}

/** Simpan riwayat (maks. MAX_MESSAGES terbaru). Gagal = diabaikan, bukan error. */
export function saveChatHistory(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  let toSave = messages.slice(-MAX_MESSAGES);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const payload: StoredChat = { savedAt: Date.now(), messages: toSave };
      window.localStorage.setItem(KEY, JSON.stringify(payload));
      return;
    } catch {
      // Kuota penuh (js-nya membesar): buang separuh setua, coba lagi.
      toSave = toSave.slice(Math.ceil(toSave.length / 2));
      if (toSave.length === 0) return;
    }
  }
}

export function clearChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // abaikan
  }
}
