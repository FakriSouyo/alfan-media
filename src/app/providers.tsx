"use client";

import { type ReactNode } from "react";
import { ShapeProvider } from "@/lib/shape-context";
import { SizeProvider } from "@/lib/size-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreProvider } from "@/lib/store-context";
import { ThemeProvider } from "@/lib/theme-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StoreProvider>
          <ShapeProvider defaultShape="rounded">
            <SizeProvider defaultSize="default">
              {children}
            </SizeProvider>
          </ShapeProvider>
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}