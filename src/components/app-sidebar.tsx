"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarTrigger,
  SidebarRail,
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
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  CircleUserRound,
  Sparkles,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavChild = { label: string; href: string };
type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  children?: NavChild[];
};

const nav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Produk",
    href: "/stock/products",
    icon: Package,
    children: [
      { label: "Daftar Produk", href: "/stock/products" },
      { label: "Tambah Produk", href: "/stock/products/new" },
      { label: "Kategori", href: "/stock/categories" },
    ],
  },
  {
    label: "Penjualan",
    href: "/sales",
    icon: ShoppingCart,
    children: [
      { label: "Penjualan Baru", href: "/sales/new" },
      { label: "Pesanan", href: "/sales/orders" },
    ],
  },
  {
    label: "Laporan",
    href: "/reports",
    icon: BarChart3,
    children: [
      { label: "Penjualan", href: "/reports/sales" },
      { label: "Inventaris", href: "/reports/inventory" },
    ],
  },
];

function isParentActive(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function activePage(pathname: string) {
  for (const item of nav) {
    const child = item.children?.find((entry) => pathname === entry.href);
    if (child) return { section: item.label, label: child.label };
    if (isParentActive(pathname, item)) return { section: item.label, label: item.label };
  }
  if (pathname === "/agent") return { section: "Asisten", label: "Asisten AI" };
  if (pathname === "/settings") return { section: "Akun", label: "Pengaturan" };
  return { section: "Workspace", label: "Halaman" };
}

export function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({
    Produk: true,
    Penjualan: true,
    Laporan: true,
  });
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const page = useMemo(() => activePage(pathname), [pathname]);

  const toggleParent = (label: string) =>
    setOpenParents((state) => ({ ...state, [label]: !state[label] }));

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Sidebar variant="inset" side="left" collapsible="offcanvas">
        <SidebarHeader className="gap-3 p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="h-auto min-h-12 px-2 py-2 hover:bg-transparent">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
                  <Image
                    src="/logo.webp"
                    alt="Logo Alfan Media"
                    width={25}
                    height={25}
                    className="size-6 object-contain brightness-0 invert"
                  />
                </span>
                <span className="flex min-w-0 flex-col text-left">
                  <span className="truncate text-[14px] font-semibold text-foreground">Alfan Media</span>
                  <span className="truncate text-[11px] text-muted-foreground">Operasional toko buku</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <Link
            href="/sales/new"
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-semibold text-background shadow-sm transition-opacity hover:opacity-85"
          >
            <Plus size={14} /> Penjualan baru
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup defaultOpen>
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Menu utama
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const hasChildren = Boolean(item.children);
                  const openState = openParents[item.label] ?? false;
                  const active = isParentActive(pathname, item);
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild={!hasChildren}
                        icon={item.icon}
                        isActive={active}
                        onClick={hasChildren ? () => toggleParent(item.label) : undefined}
                      >
                        {hasChildren ? (
                          <span className="flex-1 text-left">{item.label}</span>
                        ) : (
                          <Link href={item.href}>
                            <span>{item.label}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>

                      {hasChildren && (
                        <>
                          <SidebarMenuAction
                            onClick={() => toggleParent(item.label)}
                            aria-expanded={openState}
                            className="text-muted-foreground"
                          >
                            <ChevronRight
                              size={14}
                              className={cn("transition-transform duration-150", openState && "rotate-90")}
                            />
                            <span className="sr-only">
                              {openState ? "Tutup" : "Buka"} {item.label}
                            </span>
                          </SidebarMenuAction>
                          <SidebarMenuSub open={openState}>
                            {item.children?.map((child) => (
                              <SidebarMenuSubItem key={child.href}>
                                <SidebarMenuSubButton asChild isActive={pathname === child.href}>
                                  <Link href={child.href}>
                                    <span>{child.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Bantuan kerja
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild icon={Sparkles} isActive={pathname === "/agent"}>
                    <Link href="/agent"><span>Asisten AI</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownTrigger
              render={
                <button className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background/70 p-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#737373)] [&[data-state=open]]:bg-active">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-[11px] font-semibold text-background">
                    {user?.name?.charAt(0) ?? "A"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12px] font-semibold text-foreground">{user?.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{user?.role === "admin" ? "Administrator" : "Staff"}</span>
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                </button>
              }
              className="w-full"
            />
            <DropdownContent side="top" align="start" className="w-[230px]">
              <DropdownLabel>
                {user?.name}
                <span className="block truncate text-muted-foreground">{user?.email}</span>
              </DropdownLabel>
              <MenuItem index={0} icon={CircleUserRound} label="Profil" onSelect={() => {}} />
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/85 px-3 backdrop-blur-xl sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="size-8 rounded-lg border border-border/70 bg-card text-muted-foreground hover:bg-hover hover:text-foreground" />
            <div className="hidden min-w-0 items-center gap-2 text-[12px] sm:flex">
              <span className="text-muted-foreground">{page.section}</span>
              <ChevronRight size={13} className="shrink-0 text-muted-foreground/60" />
              <span className="truncate font-medium text-foreground">{page.label}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Gunakan mode terang" : "Gunakan mode gelap"}
            className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#737373)]"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>
        <div className="app-page flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
