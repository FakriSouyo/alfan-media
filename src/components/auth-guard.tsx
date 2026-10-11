"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !error) {
      router.replace("/login");
    }
  }, [user, loading, error, router]);

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  if (!user && error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div role="alert" className="max-w-md rounded-xl border border-destructive/30 bg-background p-5 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" onClick={() => router.replace("/login")} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted">Kembali ke halaman masuk</button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
