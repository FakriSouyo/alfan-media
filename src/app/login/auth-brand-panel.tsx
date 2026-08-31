"use client";

import { IsometricQueue } from "@/components/isometric-queue";

/**
 * Right-hand brand panel for the login screen.
 * Dark background with centered isometric queue illustration.
 * Hidden on small screens.
 */
export function AuthBrandPanel() {
  return (
    <aside className="relative hidden lg:block">
      <div
        className="sticky top-0 flex h-svh w-full items-center justify-center overflow-hidden border-l border-white/10"
        style={{ backgroundColor: "#171717" }}
      >
        {/* Subtle grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        {/* Soft glow behind the illustration */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[320px] rounded-full blur-3xl opacity-20"
          style={{ background: "var(--primary, #6B97FF)" }}
        />

        {/* Isometric illustration centered */}
        <div className="relative z-10 w-full px-10">
          <IsometricQueue />
        </div>
      </div>
    </aside>
  );
}
