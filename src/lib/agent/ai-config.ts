// ─────────────────────────────────────────────────────────────────────────────
// Admin-only auth + shared validation for AI provider configuration.
// The API key is stored in Supabase (admin-only RLS) and is ALWAYS masked in
// API responses — the raw key never leaves the server except inside the
// outbound request to the provider.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProviderModel } from "./llm/types";

export type AdminAuth =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      user: { id: string; email: string | null };
    }
  | { ok: false; status: number; message: string };

export async function requireAdmin(): Promise<AdminAuth> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: "Anda harus masuk untuk melanjutkan." };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, status: 403, message: "Hanya admin yang dapat mengelola pengaturan AI." };
  }
  return { ok: true, supabase, user: { id: user.id, email: user.email ?? null } };
}

// ─── Input validation ────────────────────────────────────────────────────────

export const PROVIDER_ID_RE = /^[a-z][a-z0-9-]{1,39}$/;

export interface ProviderInput {
  providerId?: string;
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: ProviderModel[];
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `••••${key.slice(-4)}`;
}

export function validateProviderInput(
  input: ProviderInput,
  { requireKey }: { requireKey: boolean },
): { ok: true; value: Required<Pick<ProviderInput, "providerId" | "displayName" | "baseUrl" | "models">> & { apiKey?: string } } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const providerId = input.providerId?.trim().toLowerCase() ?? "";
  if (!PROVIDER_ID_RE.test(providerId)) {
    errors.providerId = "Provider ID: huruf kecil, digit, dan tanda hubung; diawali huruf; 2–40 karakter.";
  }

  const displayName = input.displayName?.trim() ?? "";
  if (displayName.length < 2 || displayName.length > 60) {
    errors.displayName = "Display name 2–60 karakter.";
  }

  let baseUrl = input.baseUrl?.trim() ?? "";
  if (baseUrl) baseUrl = baseUrl.replace(/\/+$/, "");
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("proto");
  } catch {
    errors.baseUrl = "Base URL tidak valid (mis. https://gateway.example/v1).";
  }

  let apiKey: string | undefined;
  if (input.apiKey && input.apiKey.trim()) {
    const k = input.apiKey.trim();
    if (k === maskApiKey(k) || k.startsWith("•")) {
      // The masked value came back from the form — treat as "keep existing".
      apiKey = undefined;
    } else if (k.length < 8 || k.length > 300) {
      errors.apiKey = "API key 8–300 karakter.";
    } else {
      apiKey = k;
    }
  } else if (requireKey) {
    errors.apiKey = "API key wajib diisi.";
  }

  let models: ProviderModel[] = [];
  if (input.models !== undefined) {
    if (!Array.isArray(input.models)) {
      errors.models = "Models harus berupa daftar.";
    } else {
      models = input.models
        .filter((m) => m && typeof m.id === "string" && m.id.trim().length > 0)
        .map((m) => ({
          id: m.id.trim().slice(0, 160),
          display_name:
            typeof m.display_name === "string" && m.display_name.trim()
              ? m.display_name.trim().slice(0, 80)
              : undefined,
        }))
        .slice(0, 200);
      if (models.length > 200) errors.models = "Maksimal 200 model.";
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      providerId,
      displayName,
      baseUrl,
      models,
      ...(apiKey ? { apiKey } : {}),
    },
  };
}
