"use client";

import { useAuth } from "@/lib/auth-context";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/page-header";

export default function ProfilePage() {
  const { user } = useAuth();
  return <AuthGuard><main className="p-4 lg:p-6"><PageHeader title="Profil" description="Informasi akun yang sedang digunakan." />
    <dl className="mt-4 max-w-xl divide-y divide-border rounded-xl border border-border bg-background px-4">
      <div className="py-3"><dt className="text-xs text-muted-foreground">Nama</dt><dd className="mt-1 text-sm font-medium text-foreground">{user?.name}</dd></div>
      <div className="py-3"><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 text-sm font-medium text-foreground">{user?.email}</dd></div>
      <div className="py-3"><dt className="text-xs text-muted-foreground">Peran</dt><dd className="mt-1 text-sm font-medium text-foreground">{user?.role === "admin" ? "Administrator" : "Staff"}</dd></div>
    </dl>
  </main></AuthGuard>;
}
