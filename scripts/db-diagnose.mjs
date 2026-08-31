/* Diagnostic (plain ESM, no deps beyond supabase-js): run the exact queries
 * the app issues against live Supabase to surface runtime errors. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env["NEXT_PUBLIC_SUPABASE_URL"];
const anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
if (!url || !anon) { console.error("missing env"); process.exit(1); }

const sb = createClient(url, anon);
const results = [];
const log = (s) => { results.push(s); console.log(s); };

async function tryQuery(name, fn) {
  try {
    const r = await fn();
    const err = r && r.error ? r.error : (r && r.data && r.data.length === 0 ? null : null);
    log(`${name.padEnd(44)} -> ${err ? "ERROR: " + JSON.stringify(err) : "OK"}`);
  } catch (e) {
    log(`${name.padEnd(44)} -> THROW: ${JSON.stringify(String(e))}`);
  }
}

log("=== TABLE SELECT (anon; RLS may zero rows) ===");
for (const t of ["categories","products","product_prices","customers","orders","order_items","stock_movements","surat_jalans","documents","settings","profiles"]) {
  await tryQuery(`select ${t}`, () => sb.from(t).select("*", { count: "exact", head: true }));
}

log("\n=== APP ORDER QUERIES ===");
await tryQuery("orders.order(order_date desc)", () => sb.from("orders").select("*").order("order_date", { ascending: false }));
await tryQuery("orders eq invoice_no .single()", () => sb.from("orders").select("id").eq("invoice_no","INV-001").single());
await tryQuery("orders embed order_items", () => sb.from("orders").select("id, items:order_items(*)").eq("invoice_no","INV-001").single());

log("\n=== SETTINGS EXPORT (settings has NO created_at -> expect 400) ===");
await tryQuery("settings.order(created_at)", () => sb.from("settings").select("*").order("created_at", { ascending: true }));

log("\n=== next_invoice_no RPC (expect permission denied as anon) ===");
await tryQuery("rpc next_invoice_no", () => sb.rpc("next_invoice_no"));

log("\n=== profile by uuid (anon) ===");
await tryQuery("profiles eq id .maybeSingle()", () => sb.from("profiles").select("id,name,email,role").eq("id","00000000-0000-0000-0000-000000000000").maybeSingle());

writeFileSync(join(__dirname, "db-diagnose-results.txt"), results.join("\n"), "utf8");
console.log("\nDONE -> scripts/db-diagnose-results.txt");