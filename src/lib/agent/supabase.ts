// ─────────────────────────────────────────────────────────────────────────────
// Agent auth: every agent request runs as the authenticated Supabase user.
// RLS keeps applying — the agent never bypasses the security model.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AgentUser } from "./types";

export type AgentAuth =
  | { ok: true; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; user: AgentUser }
  | { ok: false; status: number; message: string };

export async function requireAgentUser(): Promise<AgentAuth> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: "Anda harus masuk untuk menggunakan AI assistant." };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role: AgentUser["role"] = profile?.role === "admin" ? "admin" : "staff";
  return { ok: true, supabase, user: { id: user.id, role } };
}
