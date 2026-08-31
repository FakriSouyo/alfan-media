// Browser-side singleton Supabase client.
// Dipakai oleh semua context/provider yang berjalan di client component.
// PENTING: JANGAN pakai service_role di sini — hanya anon key.
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
