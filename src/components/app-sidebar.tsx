
import { useMemo, useState } from "react";
import { Link } from "@/lib/navigation";
import { Image } from "@/lib/navigation";
import { usePathname, useRouter } from "@/lib/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { MenuItem } from "@/components/ui/menu-item";
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Tags,
  ReceiptText,
  BarChart3,
  Boxes,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  ChevronsUpDown,
  CircleUserRound,
  Sparkles,
  Plus,
} from "lucide-react";
import { useStore } from "@/lib/store-context";

type NavLinkItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Defaults to an exact match on `href`. */
  match?: (pathname: string) => boolean;
  badge?: "lowStock" | "activeOrders";
};
type NavSection = { label: string; items: NavLinkItem[] };

const NEW_SALE_HREF = "/sales/new";

const sections: NavSection[] = [
  {
    label: "Ringkasan",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Penjualan",
    items: [
      { label: "Pesanan", href: "/sales/orders", icon: ReceiptText, match: (p) => p.startsWith("/sales/orders"), badge: "activeOrders" },
    ],
  },
  {
    label: "Katalog",
    items: [
      {
        label: "Produk",
        href: "/stock/products",
        icon: Package,
        match: (p) => p === "/stock/products" || (p.startsWith("/stock/products/") && p !== "/stock/products/new"),
        badge: "lowStock",
      },
      { label: "Tambah produk", href: "/stock/products/new", icon: PackagePlus },
      { label: "Kategori", href: "/stock/categories", icon: Tags },
    ],
  },
  {
    label: "Laporan",
    items: [
      { label: "Penjualan", href: "/reports/sales", icon: BarChart3 },
      { label: "Inventaris", href: "/reports/inventory", icon: Boxes },
    ],
  },
  {
    label: "Bantuan kerja",
    items: [{ label: "Asisten AI", href: "/agent", icon: Sparkles }],
  },
];

const isActive = (pathname: string, item: NavLinkItem) => (item.match ? item.match(pathname) : pathname === item.href);

function activePage(pathname: string) {
  if (pathname === NEW_SALE_HREF) return { section: "Penjualan", label: "Penjualan baru" };
  for (const section of sections) {
    const item = section.items.find((entry) => isActive(pathname, entry));
    if (item) return { section: section.label, label: item.label };
  }
  if (pathname === "/profile") return { section: "Akun", label: "Profil" };
  if (pathname === "/settings") return { section: "Akun", label: "Pengaturan" };
  return { section: "Alfan Media", label: "Halaman" };
}

/** Link that also closes the mobile drawer once a destination is chosen. */
function SidebarLink({ className, onClick, ...props }: React.ComponentProps<typeof Link>) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Link
      {...props}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (isMobile) setOpenMobile(false);
      }}
    />
  );
}

export function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { products, orders, error: storeError, loading: storeLoading, refresh } = useStore();
  const { theme, toggleTheme } = useTheme();
  const page = useMemo(() => activePage(pathname), [pathname]);

  const badges = useMemo(() => ({
    lowStock: products.filter((product) => product.stock <= 5).length,
    activeOrders: orders.filter((order) => !order.archived && (order.status === "DRAFT" || order.status === "CHECKED_OUT")).length,
  }), [products, orders]);
  const badgeLabel = { lowStock: "judul stok menipis", activeOrders: "pesanan belum selesai" } as const;

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Sidebar variant="inset" side="left" collapsible="offcanvas">
        <SidebarHeader className="app-brand">
          <SidebarLink href="/dashboard" className="app-brand-link" aria-label="Alfan Media, buka dashboard">
            <span className="app-brand-mark">
              {/* The mark ships in two cuts — the dark-mode artwork uses
                  brighter blues and is meant for the dark sidebar surface. */}
              <Image
                src={theme === "dark" ? "/brand/mark-dark.webp" : "/brand/mark-light.webp"}
                alt=""
                width={128}
                height={61}
                sizes="48px"
                loading="eager"
                className="h-4 w-auto object-contain"
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="app-brand-name">Alfan Media</span>
              <span className="app-brand-sub">Operasional toko buku</span>
            </span>
          </SidebarLink>

          <SidebarLink
            href={NEW_SALE_HREF}
            aria-current={pathname === NEW_SALE_HREF ? "page" : undefined}
            className="app-new-sale"
          >
            <span>Penjualan baru</span>
            <span className="app-new-sale-icon" aria-hidden="true"><Plus size={15} strokeWidth={2.4} /></span>
          </SidebarLink>
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label="Navigasi utama" className="app-nav">
            {sections.map((section) => (
              <div key={section.label} className="app-nav-section">
                <p className="app-nav-label" aria-hidden="true">{section.label}</p>
                <ul aria-label={section.label}>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item);
                    const count = item.badge ? badges[item.badge] : 0;
                    return (
                      <li key={item.href}>
                        <SidebarLink href={item.href} aria-current={active ? "page" : undefined} className="app-nav-link">
                          <Icon size={17} strokeWidth={1.8} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge && count > 0 && (
                            <span className={item.badge === "lowStock" ? "app-nav-badge app-nav-badge-warning" : "app-nav-badge"}>
                              {count}
                              <span className="sr-only"> {badgeLabel[item.badge]}</span>
                            </span>
                          )}
                        </SidebarLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </SidebarContent>

        <SidebarFooter className="app-sidebar-footer">
          <DropdownMenu>
            <DropdownTrigger
              render={
                <button type="button" className="app-user" aria-label={`Menu akun ${user?.name ?? ""}`}>
                  <span className="app-user-avatar" aria-hidden="true">{user?.name?.charAt(0) ?? "A"}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-foreground">{user?.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{user?.role === "admin" ? "Administrator" : "Staf toko"}</span>
                  </span>
                  <ChevronsUpDown size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              }
              className="w-full"
            />
            <DropdownContent side="top" align="start" className="w-[230px]">
              <DropdownLabel>
                {user?.name}
                <span className="block truncate text-muted-foreground">{user?.email}</span>
              </DropdownLabel>
              <MenuItem index={0} icon={CircleUserRound} label="Profil" onSelect={() => router.push("/profile")} />
              <MenuItem index={1} icon={Settings} label="Pengaturan" onSelect={() => router.push("/settings")} />
              <DropdownSeparator />
              <MenuItem
                index={2}
                icon={theme === "dark" ? Sun : Moon}
                label={theme === "dark" ? "Gunakan mode terang" : "Gunakan mode gelap"}
                onSelect={toggleTheme}
                closeOnClick={false}
              />
              <DropdownSeparator />
              <MenuItem index={3} icon={LogOut} label="Keluar" onSelect={logout} className="text-destructive [&_svg]:text-destructive" />
            </DropdownContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="app-topbar-button" />
            <span className="app-topbar-divider" aria-hidden="true" />
            <nav aria-label="Lokasi halaman" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">{page.section}</span>
              <ChevronRight size={13} className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
              <span aria-current="page" className="truncate font-medium text-foreground">{page.label}</span>
            </nav>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Gunakan mode terang" : "Gunakan mode gelap"}
            className="app-topbar-button"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>
        <div className="app-page flex-1">
          {storeLoading && <div role="status" aria-live="polite" className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground lg:mx-6"><span className="size-3 animate-spin rounded-full border-2 border-border border-t-foreground" />Memuat data toko…</div>}
          {!storeLoading && storeError && <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive lg:mx-6"><span>{storeError}</span><button type="button" onClick={() => void refresh()} className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium hover:bg-destructive/10">Coba lagi</button></div>}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
