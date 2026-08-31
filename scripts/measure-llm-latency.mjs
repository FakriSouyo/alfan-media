// ─────────────────────────────────────────────────────────────────────────────
// Diagnostik latensi gateway AI — jawab "kenapa agent lambat?" dengan angka.
//
//   node scripts/measure-llm-latency.mjs
//
// Membaca provider+model AKTIF dari Supabase (service role key dari
// .env.local), lalu mengukur:
//   1. TTFB GET /models  (jalur jaringan, tanpa beban model)
//   2. TTFB + total POST /chat/completions dengan prompt 1 kata, 3x ulangan
//      (baseline latensi model — inilah yang dialami agent per ronde LLM)
//
// API key TIDAK pernah dicetak. Aman dijalankan berulang.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: providers, error: pErr } = await supabase
  .from("ai_providers")
  .select("provider_id, display_name, base_url, enabled, models, api_key");
if (pErr) {
  console.error("Gagal membaca ai_providers:", pErr.message);
  process.exit(1);
}
const { data: settings } = await supabase
  .from("ai_settings")
  .select("*")
  .eq("id", 1)
  .maybeSingle();

console.log("=== Provider terdaftar ===");
for (const p of providers ?? []) {
  const models = (p.models ?? []).map((m) => m.id).join(", ");
  console.log(
    `- ${p.provider_id} | ${p.display_name} | ${p.base_url} | enabled=${p.enabled} | models: ${models || "(kosong)"}`,
  );
}
console.log(
  `Aktif (ai_settings): ${settings ? `${settings.provider_id} / ${settings.model_id}` : "(tidak ada — fallback ke provider pertama yang enabled)"}`,
);

const target =
  (settings && providers.find((p) => p.provider_id === settings.provider_id && p.enabled)) ||
  providers.find((p) => p.enabled);
if (!target) {
  console.error("Tidak ada provider enabled untuk diukur.");
  process.exit(1);
}
const modelId =
  settings && settings.provider_id === target.provider_id
    ? settings.model_id
    : target.models?.[0]?.id;
const key = target.api_key ?? "";
const base = target.base_url.trim().replace(/\/+$/, "");

console.log(`\n=== Mengukur: ${target.display_name} (${base}) model: ${modelId} ===\n`);

// 1) GET /models — jalur jaringan saja (tanpa beban inferensi).
{
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/models`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    const ms = Math.round(performance.now() - t0);
    console.log(`GET /models → HTTP ${res.status} dalam ${ms} ms`);
  } catch (e) {
    console.log(`GET /models → GAGAL setelah ${Math.round(performance.now() - t0)} ms: ${e.message}`);
  }
}

// 2) Chat completion streaming, prompt minimal, 3x ulangan.
for (let i = 1; i <= 3; i++) {
  const t0 = performance.now();
  let ttfb = null;
  let total = "";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        messages: [{ role: "user", content: "Balas dengan satu kata: OK" }],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 160);
      console.log(`chat #${i} → HTTP ${res.status} setelah ${Math.round(performance.now() - t0)} ms: ${detail}`);
      continue;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfb === null) ttfb = Math.round(performance.now() - t0);
      total += dec.decode(value, { stream: true });
    }
    const totalMs = Math.round(performance.now() - t0);
    console.log(
      `chat #${i} → byte pertama (TTFB) ${ttfb} ms, selesai ${totalMs} ms (prompt 1 kata, tanpa tools)`,
    );
  } catch (e) {
    console.log(`chat #${i} → GAGAL setelah ${Math.round(performance.now() - t0)} ms: ${e.message}`);
  }
  void total; // isi respons tidak perlu ditampilkan
}

console.log(
  "\nInterpretasi: TTFB chat ≈ waktu yang dialami agent untuk SATU RONDE LLM.\n" +
    "Satu giliran dengan tool = 2 ronde (analisis → jawaban) → perkiraan ×2 angka di atas.",
);
