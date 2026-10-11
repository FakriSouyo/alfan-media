"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { User } from "./types";
import { getSupabaseBrowserClient } from "./supabase/browser";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileRow = { id: string; name: string; email: string; role: "admin" | "staff" };
const profileToUser = (profile: ProfileRow): User => ({ id: profile.id, name: profile.name, email: profile.email, role: profile.role });

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email atau kata sandi tidak sesuai.";
  if (normalized.includes("email not confirmed")) return "Email belum dikonfirmasi. Hubungi administrator.";
  if (normalized.includes("too many requests")) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (normalized.includes("fetch") || normalized.includes("network")) return "Tidak dapat terhubung ke layanan autentikasi. Periksa koneksi lalu coba lagi.";
  return "Autentikasi gagal. Coba lagi atau hubungi administrator.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase: SupabaseClient = getSupabaseBrowserClient();

  useEffect(() => {
    let mounted = true;
    let authRevision = 0;
    let profileRevision = 0;
    let authInitialized = false;
    let activeUserId: string | null = null;
    let pendingProfileFor: string | null = null;
    let loadedProfileFor: string | null = null;

    const loadProfile = async (session: Session, revision: number) => {
      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id, name, email, role")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!data) throw new Error("Profil akun tidak ditemukan.");
        if (!mounted || revision !== authRevision || activeUserId !== session.user.id) return;
        loadedProfileFor = session.user.id;
        pendingProfileFor = null;
        setUser(profileToUser(data as ProfileRow));
        setError(null);
        setLoading(false);
      } catch (loadError) {
        if (!mounted || revision !== authRevision || activeUserId !== session.user.id) return;
        pendingProfileFor = null;
        setUser(null);
        setError("Sesi ditemukan, tetapi profil akun gagal dimuat. Periksa koneksi lalu kembali ke halaman masuk.");
        setLoading(false);
        console.error("Failed to load authenticated profile:", loadError);
      }
    };

    // Supabase calls must not be awaited inside onAuthStateChange. Defer the
    // profile query until after its synchronous auth callback returns.
    const applySession = (session: Session | null) => {
      const userId = session?.user.id ?? null;
      const wasInitialized = authInitialized;
      authInitialized = true;
      if (wasInitialized && userId === activeUserId && (userId === null || loadedProfileFor === userId || pendingProfileFor === userId)) return;

      authRevision += 1;
      const revision = authRevision;
      activeUserId = userId;
      pendingProfileFor = null;
      if (!userId || !session) {
        profileRevision += 1;
        loadedProfileFor = null;
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      }

      loadedProfileFor = null;
      pendingProfileFor = userId;
      setUser(null);
      setError(null);
      setLoading(true);
      const requestRevision = ++profileRevision;
      queueMicrotask(() => {
        if (requestRevision === profileRevision) void loadProfile(session, revision);
      });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));

    const initialRevision = authRevision;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted || authRevision !== initialRevision) return;
      if (sessionError) {
        setError("Sesi autentikasi gagal dipulihkan. Periksa koneksi lalu muat ulang halaman.");
        setLoading(false);
        return;
      }
      applySession(data.session);
    }).catch((sessionError: unknown) => {
      if (!mounted || authRevision !== initialRevision) return;
      setError("Sesi autentikasi gagal dipulihkan. Periksa koneksi lalu muat ulang halaman.");
      setLoading(false);
      console.error("Failed to restore auth session:", sessionError);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const login = useCallback(async (email: string, password: string) => {
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    return loginError ? { error: friendlyAuthError(loginError.message) } : {};
  }, [supabase]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    // Use the same response for existing and unknown accounts to prevent account enumeration.
    return resetError ? { error: friendlyAuthError(resetError.message) } : {};
  }, [supabase]);

  const logout = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError("Gagal keluar dari akun. Periksa koneksi lalu coba lagi.");
      console.error("Failed to sign out:", signOutError);
      return;
    }
    setUser(null);
  }, [supabase]);

  const value = useMemo(() => ({ user, loading, error, login, requestPasswordReset, logout }), [user, loading, error, login, requestPasswordReset, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
