import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@/components/agent/agent-chat";
import {
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
} from "@/lib/agent/chat-storage";

const KEY = "alfan:agent-chat:v1";

function mkMsg(id: string, patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: "agent",
    text: `teks ${id}`,
    blocks: [],
    activity: [],
    todos: [],
    approval: undefined,
    status: "complete",
    notice: null,
    startedAt: 1_000_000,
    ...patch,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("chat-storage (localStorage, auto-expiry 7 hari)", () => {
  it("round-trip: simpan lalu muat kembali (termasuk blocks)", () => {
    const msgs = [
      mkMsg("u1", { role: "user", text: "stok ipa berapa?" }),
      mkMsg("a1", {
        blocks: [{ kind: "list", title: "Stok", rows: [{ id: "1", label: "IPA", value: "10" }] }],
        activity: [{ id: "s1", type: "step", label: "get_low_stock", status: "complete" }],
      }),
    ];
    saveChatHistory(msgs);
    const loaded = loadChatHistory();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].text).toBe("stok ipa berapa?");
    expect(loaded[1].blocks[0].kind).toBe("list");
  });

  it("riwayat > 7 hari dibuang saat dimuat", () => {
    const old = {
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      messages: [mkMsg("x")],
    };
    window.localStorage.setItem(KEY, JSON.stringify(old));
    expect(loadChatHistory()).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("riwayat < 7 hari tetap hidup", () => {
    const recent = {
      savedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
      messages: [mkMsg("x")],
    };
    window.localStorage.setItem(KEY, JSON.stringify(recent));
    expect(loadChatHistory()).toHaveLength(1);
  });

  it("JSON rusak → kosong + key dibersihkan (tidak melempar)", () => {
    window.localStorage.setItem(KEY, "{bukan-json");
    expect(loadChatHistory()).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("sisa streaming dinormalisasi jadi complete (F5 mid-stream)", () => {
    const msgs = [
      mkMsg("a", {
        status: "streaming",
        activity: [{ id: "s1", type: "step", label: "tool", status: "active" }],
      }),
    ];
    saveChatHistory(msgs);
    const loaded = loadChatHistory();
    expect(loaded[0].status).toBe("complete");
    const act = loaded[0].activity[0];
    expect(act.type).toBe("step");
    if (act.type === "step") expect(act.status).toBe("complete");
    expect(loaded[0].endedAt).toBe(loaded[0].startedAt);
  });

  it("cap 200 pesan: hanya yang terbaru disimpan", () => {
    const many = Array.from({ length: 250 }, (_, i) => mkMsg(`m${i}`));
    saveChatHistory(many);
    const loaded = loadChatHistory();
    expect(loaded).toHaveLength(200);
    expect(loaded[0].id).toBe("m50");
    expect(loaded[199].id).toBe("m249");
  });

  it("kuota penuh: setua di-jatuhkan separuh, tetap tersimpan", () => {
    // jsdom: spy di Storage.prototype tidak mempan → ganti instansinya.
    let calls = 0;
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          calls += 1;
          if (calls === 1) throw new Error("QuotaExceededError");
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
    const many = Array.from({ length: 200 }, (_, i) => mkMsg(`m${i}`));
    expect(() => saveChatHistory(many)).not.toThrow();
    expect(calls).toBe(2); // percobaan 1 gagal → 2 (setelah membuang separuh)
    const loaded = loadChatHistory();
    expect(loaded.length).toBe(100); // separuh setua dibuang
    expect(loaded[0].id).toBe("m100");
  });

  it("clearChatHistory: riwayat terhapus", () => {
    saveChatHistory([mkMsg("u"), mkMsg("a")]);
    clearChatHistory();
    expect(loadChatHistory()).toEqual([]);
  });
});
