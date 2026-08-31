import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const t = readFileSync(".env.local", "utf8");
for (const l of t.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const q1 = await sb.from("ai_providers").select("*").eq("enabled", true).order("display_name");
console.log('1) .eq("enabled",true)  ->', q1.error ? "ERROR: " + q1.error.message : "ok");

const q2 = await sb.from("ai_providers").select("*").order("display_name");
console.log("2) select * (tanpa filter) ->", q2.error ? "ERROR: " + q2.error.message : `ok (${q2.data?.length ?? 0} baris terlihat anon)`);

const q3 = await sb.from("ai_providers").select("enabled").limit(1);
const detected = q3.error ? !/does not exist|column/i.test(q3.error.message) : true;
console.log("3) deteksi kolom enabled ->", detected ? "kolom ADA" : "kolom TIDAK ADA -> guard 400 aktif");

const q4 = await sb.from("ai_settings").select("*").eq("id", 1).maybeSingle();
console.log("4) ai_settings id=1 ->", q4.error ? "ERROR: " + q4.error.message : q4.data ? "ada baris" : "kosong (anon)");
