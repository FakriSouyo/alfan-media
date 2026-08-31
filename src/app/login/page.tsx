import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { AuthBrandPanel } from "./auth-brand-panel";

export const metadata: Metadata = {
  title: "Sign in · Alfan Media",
  description: "Sign in to manage your bookstore dashboard.",
};

export default function LoginPage() {
  return (
    <main className="relative min-h-svh w-full overflow-hidden bg-background text-foreground">
      <div className="grid min-h-svh w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Form column — has a subtle warm gradient so the section never reads
            as flat black. Uses the fluid highlight tokens so light mode fades
            to a near-invisible tint instead of staying dark. */}
        <section
          className="relative flex items-center justify-center px-6 py-12 sm:px-10 text-white"
          style={{ backgroundColor: "#171717" }}
        >
          <LoginForm />
        </section>

        {/* Brand / illustration column — hidden on small screens */}
        <AuthBrandPanel />
      </div>
    </main>
  );
}
