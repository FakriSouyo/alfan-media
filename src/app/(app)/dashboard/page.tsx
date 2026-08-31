"use client";

import { useStore } from "@/lib/store-context";
import { useAuth } from "@/lib/auth-context";
import { formatRupiah } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { categoryText } from "@/components/category-label";
import { useSurface } from "@/lib/surface-context";
import { surfaceClasses } from "@/lib/surface-classes";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
} from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat pagi";
  if (h < 17) return "Selamat siang";
  return "Selamat malam";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { orders, products, movements, categories } = useStore();
  // The page floats inside the inset card (surface-2). Every panel on top of
  // it steps up one level so the ladder reads correctly.
  const substrate = useSurface();

  const completedOrders = orders.filter((o) => o.status === "COMPLETED");
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = completedOrders.filter((o) => o.date === todayStr);
  const totalSalesToday = todayOrders.reduce((s, o) => s + o.total, 0);
  const totalSalesAll = completedOrders.reduce((s, o) => s + o.total, 0);
  const lowStockProducts = products.filter((p) => p.stock <= 5);

  const stats = [
    { label: "Penjualan Hari Ini", value: formatRupiah(totalSalesToday), icon: TrendingUp, color: "text-emerald-500" },
    { label: "Pesanan Hari Ini", value: String(todayOrders.length), icon: ShoppingCart, color: "text-blue-500" },
    { label: "Total Produk", value: String(products.length), icon: Package, color: "text-violet-500" },
    { label: "Stok Menipis", value: String(lowStockProducts.length), icon: AlertTriangle, color: "text-amber-500" },
  ];

  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const statusColor: Record<string, string> = {
    COMPLETED: "bg-emerald-500/15 text-emerald-500",
    CHECKED_OUT: "bg-blue-500/15 text-blue-500",
    DRAFT: "bg-muted text-muted-foreground",
    CANCELLED: "bg-destructive/15 text-destructive",
  };

  const statusLabel: Record<string, string> = {
    COMPLETED: "Selesai",
    CHECKED_OUT: "Diproses",
    DRAFT: "Draft",
    CANCELLED: "Dibatalkan",
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title={`${getGreeting()}, ${user?.name?.split(" ")[0] ?? "Admin"}.`}
        description="Berikut ringkasan aktivitas hari ini."
      />

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={cn("rounded-xl p-3", surfaceClasses(substrate + 1))}>
            <div className="flex items-center gap-2">
              <s.icon size={16} className={s.color} strokeWidth={1.5} />
              <span className="min-w-0 truncate text-[12px] text-muted-foreground">{s.label}</span>
            </div>
            <div className="mt-1.5 min-w-0 truncate text-lg font-semibold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Recent Orders */}
        <div className={cn("rounded-xl", surfaceClasses(substrate + 2))}>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Pesanan Terbaru</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Invoice</th>
                  <th className="px-4 py-2 font-medium hidden md:table-cell">Pelanggan</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{o.id}</div>
                      <div className="max-w-[150px] truncate text-[11px] text-muted-foreground md:hidden">{o.customerName}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{o.customerName}</td>
                    <td className="px-4 py-2 text-right font-medium text-foreground">{formatRupiah(o.total)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor[o.status]}`}>
                        {statusLabel[o.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Belum ada pesanan</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock */}
        <div className={cn("rounded-xl", surfaceClasses(substrate + 2))}>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-foreground">Stok Menipis</h2>
          </div>
          <div className="p-3">
            {lowStockProducts.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">Semua stok aman</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-foreground/[0.03]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.stock} tersisa</div>
                    </div>
                    <div className={`text-[12px] font-semibold ${p.stock <= 2 ? "text-destructive" : "text-amber-500"}`}>
                      {p.stock}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className={cn("mt-5 rounded-xl", surfaceClasses(substrate + 2))}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-foreground">Ringkasan Inventaris</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-2 font-medium">Produk</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Kategori</th>
                <th className="px-4 py-2 font-medium text-right">Stok</th>
                <th className="px-4 py-2 font-medium text-right">
                  <span className="hidden md:inline">Harga Normal</span>
                  <span className="md:hidden">Harga</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 5).map((p) => {
                const cat = categories.find((c) => c.id === p.categoryId);
                const defaultPrice = p.prices.find((pr) => pr.isDefault)?.price ?? 0;
                return (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="max-w-[150px] truncate text-[11px] text-muted-foreground md:hidden">{categoryText(cat)}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{categoryText(cat)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={p.stock <= 5 ? "text-destructive font-semibold" : "text-foreground"}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-foreground">{formatRupiah(defaultPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}