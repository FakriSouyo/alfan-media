"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "./types";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase/browser";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mapping row `profiles` (Supabase) → object `User` (app).
type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
};

function profileToUser(p: ProfileRow): User {
  return { id: p.id, name: p.name, email: p.email, role: p.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ambil client sekali, dipakai di semua handler.
  const supabase: SupabaseClient = getSupabaseBrowserClient();

  // Helper: dari session Supabase Auth, fetch profile di public.profiles.
  // Trigger on_auth_user_created (di 003_rls.sql) sudah auto-buat profile,
  // jadi ini seharusnya selalu berhasil untuk user valid.
  const loadProfile = useCallback(
    async (session: Session | null): Promise<User | null> => {
      if (!session?.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load profile:", error);
        return null;
      }
      if (!data) return null;
      return profileToUser(data as ProfileRow);
    },
    [supabase]
  );

  // ─── Inisialisasi: cek session yang masih aktif ────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = await loadProfile(session);
      setUser(u);
      setLoading(false);
    })();

    // Listen perubahan auth state (login, logout, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = await loadProfile(session);
      setUser(u);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  // ─── Login: pakai Supabase Auth (cek password beneran) ─────────────────
  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { error: error.message };
      }
      // onAuthStateChange akan set user dari profile.
      return {};
    },
    [supabase]
  );

  // ─── Logout ────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
