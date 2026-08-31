/* Verifikasi diagnostik sisi server: kondisi tabel AI di Supabase project.
 * Cetak TANPA api_key mentah.
 *
 * Jalankan: node scripts/verify-ai-db.mjs
 *
 * - Jika SUPABASE_SERVICE_ROLE_KEY valid → lihat isi provider + tes /models.
 * - Jika placeholder → fallback probe anon: cek keberadaan tabel/kolom
 *   (baris tetap tersembunyi oleh RLS tanpa session).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Parse .env.local sederhana (hanya yang dibutuhkan script ini).
const envText = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const role = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const roleValid = role.startsWith("eyJ") && role.length > 100 && !role.includes("your-");

const sb = createClient(url, roleValid ? role : anon, {
  auth: { persistSession: false },
});

function mask(k) {
  return k ? `••••${String(k).slice(-4)} (len=${String(k).length})` : "(null)";
}

if (!roleValid) {
  console.log("(service-role key placeholder — mode probe anon: hanya cek eksistensi tabel/kolom)");
}

const [prov, settings] = await Promise.all([
  sb.from("ai_providers").select("*").order("created_at", { ascending: true }),
  sb.from("ai_settings").select("*").eq("id", 1).maybeSingle(),
]);

console.log("── ai_providers ─────────────────────────────");
if (prov.error) console.log("ERROR:", prov.error.message);
else if ((prov.data ?? []).length === 0) {
  console.log("(kosong — atau RLS menyembunyikan baris karena tanpa session admin)");
} else {
  for (const p of prov.data) {
    console.log(
      `- ${p.provider_id} [${p.id}] enabled=${p.enabled === undefined ? "(kolom belum ada)" : p.enabled} models=${(p.models ?? []).length} key=${mask(p.api_key)} base=${p.base_url}`,
    );
  }
}

console.log("── ai_settings (id=1) ───────────────────────");
if (settings.error) console.log("ERROR:", settings.error.message);
else if (!settings.data) console.log("(tidak ada baris aktif — atau RLS menyembunyikan)");
else console.log(`- aktif: provider=${settings.data.provider_id} model=${settings.data.model_id}`);

const check = await sb.from("ai_providers").select("enabled").limit(1);
console.log("── kolom enabled (migration 010) ────────────");
if (check.error) {
  if (/does not exist|column/i.test(check.error.message)) {
    console.log("BELUM ADA — jalankan supabase/migration/010_ai_provider_enabled.sql di SQL Editor.");
  } else console.log("ERROR:", check.error.message);
} else console.log("OK — kolom enabled ada (baris mungkin kosong karena RLS).");

// Tes endpoint /models (hanya jika data provider terbaca, mis. via service-role).
const readable = (prov.data ?? []).filter((p) => p.base_url);
if (roleValid && readable.length) {
  console.log("── tes endpoint /models per provider ──────");
  for (const p of readable) {
    if (p.enabled === false) {
      console.log(`- ${p.provider_id}: dilewati (nonaktif)`);
      continue;
    }
    const base = String(p.base_url).replace(/\/+$/, "");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/models`, {
        headers: p.api_key ? { authorization: `Bearer ${p.api_key}` } : {},
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const n = Date.now() - t0;
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 160);
        console.log(`- ${p.provider_id}: HTTP ${res.status} dalam ${n} ms — ${detail}`);
      } else {
        const j = await res.json().catch(() => null);
        const list = Array.isArray(j?.data) ? j.data : [];
        console.log(
          `- ${p.provider_id}: OK dalam ${n} ms — ${list.length} model; contoh: ${list
            .slice(0, 3)
            .map((m) => m.id)
            .join(", ")}`,
        );
      }
    } catch (e) {
      clearTimeout(timer);
      const isTimeout = ctrl.signal.aborted;
      console.log(
        `- ${p.provider_id}: GAGAL ${isTimeout ? "(timeout 10 dtk)" : `(${e.cause?.code ?? e.message})`}`,
      );
    }
  }
}
