"use client";

import { AuthGuard } from "@/components/auth-guard";
import { AppSidebarLayout } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppSidebarLayout>{children}</AppSidebarLayout>
    </AuthGuard>
  );
}
