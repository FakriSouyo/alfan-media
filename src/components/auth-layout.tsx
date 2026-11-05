import type { ReactNode } from "react";
import { BookOpen, LibraryBig } from "lucide-react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1.04fr)_minmax(0,1fr)]">
      <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-[#142d29] p-10 text-[#f7f0df] lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <LibraryBig size={22} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-[0.18em] uppercase">Alfan Media</span>
        </div>
        <div className="my-12">
          <p className="mb-5 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-[#d6be8f] uppercase">
            <span className="h-px w-8 bg-current" /> Ruang kerja toko buku
          </p>
          <p className="max-w-[12ch] font-serif text-[clamp(3rem,5vw,6.5rem)] leading-[0.98] tracking-tight">Setiap buku punya tempat.</p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#b8cdc5]">Kelola katalog, persediaan, dan penjualan toko dalam satu ruang kerja.</p>
        </div>
        <div aria-hidden="true" className="flex h-36 items-end gap-2 border-b-2 border-[#d6be8f]/45 pb-2">
          <div className="h-[76%] w-[11%] rounded-t-sm bg-[#ab5d47]" />
          <div className="h-full w-[17%] rounded-t-sm border border-[#e9d7ad]/60 bg-[#e9d7ad] p-2 text-[#253c35]"><BookOpen className="mx-auto mt-3" size={20} /></div>
          <div className="h-[86%] w-[8%] rounded-t-sm bg-[#789b8a]" />
          <div className="h-[96%] w-[14%] rounded-t-sm border border-[#d6be8f]/50 bg-[#345b50]" />
          <div className="h-[64%] w-[10%] rounded-t-sm bg-[#d2a661]" />
          <div className="mb-0.5 grid h-[55%] w-[32%] content-end gap-2">
            <div className="h-4 rounded-sm bg-[#789b8a]" />
            <div className="h-5 rounded-sm border border-[#d6be8f]/50 bg-[#345b50]" />
            <div className="h-4 rounded-sm bg-[#ab5d47]" />
          </div>
        </div>
      </aside>
      <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 lg:py-14">
        <div className="w-full max-w-[440px]">
          <div className="mb-10 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><LibraryBig size={20} aria-hidden="true" /></span>
            <span className="font-semibold tracking-tight">Alfan Media</span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
