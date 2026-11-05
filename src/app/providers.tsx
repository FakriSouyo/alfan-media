
import { type ReactNode } from "react";
import { ShapeProvider } from "@/lib/shape-context";
import { SizeProvider } from "@/lib/size-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreProvider } from "@/lib/store-context";
import { ThemeProvider } from "@/lib/theme-context";
import { usePathname } from "@/lib/navigation";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsStore = /^\/(dashboard|stock|sales|reports)(\/|$)/.test(pathname);
  return (
    <ThemeProvider>
      <AuthProvider>
        <StoreProvider enabled={needsStore}>
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
