"use client";

import { useState } from "react";
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
  SidebarInput,
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
  { label: "AI Assistant", href: "/agent", icon: Sparkles },
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

function isChildActive(pathname: string, child: NavChild): boolean {
  return pathname === child.href;
}

function isParentActive(pathname: string, item: NavItem): boolean {
  if (!item.children) return false;
  return item.children.some((c) => isChildActive(pathname, c));
}

interface AppSidebarLayoutProps {
  children: React.ReactNode;
}

export function AppSidebarLayout({ children }: AppSidebarLayoutProps) {
  const [open, setOpen] = useState(true);
  // One level of nested nav — default parents open (matches the demo).
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({
    Produk: true,
    Penjualan: true,
    Laporan: true,
  });
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const toggleParent = (label: string) =>
    setOpenParents((p) => ({ ...p, [label]: !p[label] }));

  const handleLogout = () => {
    // AuthGuard (in the (app) layout) redirects to /login once user is null.
    logout();
  };

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Sidebar variant="inset" side="left" collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="default">
                <Image
                  src="/logo.webp"
                  alt="Logo Alfan Media"
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-[4px] object-contain"
                />
                <span className="text-[13px] font-semibold">Alfan Media</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarInput placeholder="Cari…" aria-label="Cari" />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup defaultOpen>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const openState = openParents[item.label] ?? false;
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild={!item.children}
                        // A parent row is a toggle (not a link); it stays
                        // contextually active while a child is selected, but
                        // the actual highlight belongs to the child row.
                        isActive={
                          isParentActive(pathname, item) ||
                          (!item.children && pathname === item.href)
                        }
                        icon={item.icon}
                        onClick={
                          item.children
                            ? () => toggleParent(item.label)
                            : undefined
                        }
                      >
                        {item.children ? (
                          <span className="flex-1 text-left">{item.label}</span>
                        ) : (
                          <Link href={item.href}>
                            <span>{item.label}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>

                      {item.children && (
                        <>
                          <SidebarMenuAction
                            onClick={() => toggleParent(item.label)}
                            aria-expanded={openState}
                            className="text-muted-foreground"
                          >
                            <ChevronRight
                              size={14}
                              className={cn(
                                "transition-transform duration-150",
                                openState && "rotate-90"
                              )}
                            />
                            <span className="sr-only">
                              {openState ? "Tutup" : "Buka"} {item.label}
                            </span>
                          </SidebarMenuAction>

                          <SidebarMenuSub open={openState}>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.href}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isChildActive(pathname, child)}
                                >
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
        </SidebarContent>

        <SidebarFooter>
          {/* Profile row — clicking opens a contextual menu elevated above the
              sidebar (same surface system, no separate palette). */}
          <DropdownMenu>
            <DropdownTrigger
              render={
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left outline-none transition-colors duration-80 hover:bg-hover focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)] [&[data-state=open]]:bg-active"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold text-foreground">
                    {user?.name?.charAt(0) ?? "A"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {user?.name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {user?.email}
                    </span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              }
              className="w-full"
            />

            <DropdownContent side="top" align="start" className="w-[220px]">
              <DropdownLabel>
                {user?.name}
                <span className="block truncate text-muted-foreground">
                  {user?.email}
                </span>
              </DropdownLabel>

              <MenuItem
                index={0}
                icon={CircleUserRound}
                label="Profil"
                onSelect={() => {}}
              />

              <MenuItem
                index={1}
                icon={Settings}
                label="Pengaturan"
                onSelect={() => {
                  router.push("/settings");
                }}
              />

              <DropdownSeparator />

              {/* Light-mode toggle lives inside the profile menu (#6). A
                  checked radio shows the current mode; selecting toggles the
                  app theme through the shared ThemeProvider. */}
              <MenuItem
                index={2}
                icon={theme === "dark" ? Sun : Moon}
                label={theme === "dark" ? "Mode terang" : "Mode gelap"}
                checked={theme === "light"}
                onSelect={toggleTheme}
                closeOnClick={false}
              />

              <DropdownSeparator />

              <MenuItem
                index={3}
                icon={LogOut}
                label="Keluar"
                onSelect={handleLogout}
                className="text-destructive [&_svg]:text-destructive"
              />
            </DropdownContent>
          </DropdownMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 px-1.5">
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}