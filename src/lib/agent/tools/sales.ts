// ─────────────────────────────────────────────────────────────────────────────
// Sales tools (read-only). "Sales" = orders with status COMPLETED, matching
// the dashboard definition.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTool, ToolContext, ToolFailure, ToolResult } from "../types";
import type { PeriodSpec } from "../schemas/tools";
import {
  type DateRange,
  type OrderItemRow,
  type OrderRow,
  periodRange,
  previousPeriod,
} from "./shared";

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface SalesSummary {
  range: DateRange;
  periodLabel: string;
  transactions: number;
  total: number;
  itemsSold: number;
  avgPerTransaction: number;
  topProducts: TopProduct[];
}

export interface SalesWithComparison extends SalesSummary {
  previousTotal: number | null;
  previousTransactions: number | null;
  /** Percentage change vs previous period (null when previous is 0). */
  deltaPercent: number | null;
}

export const get_today_sales: AgentTool = {
  name: "get_today_sales",
  description: "Ringkasan penjualan hari ini.",
  risk: "read",
};

export const get_sales: AgentTool = {
  name: "get_sales",
  description: "Ringkasan penjualan untuk periode tertentu.",
  risk: "read",
};

export const get_sales_summary: AgentTool = {
  name: "get_sales_summary",
  description: "Ringkasan penjualan per periode + perbandingan periode sebelumnya.",
  risk: "read",
};

export const get_top_selling_products: AgentTool = {
  name: "get_top_selling_products",
  description: "Produk terlaris dalam periode tertentu.",
  risk: "read",
};

// ─── Period labels ───────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<PeriodSpec["kind"], string> = {
  today: "hari ini",
  yesterday: "kemarin",
  this_week: "minggu ini",
  last_week: "minggu lalu",
  this_month: "bulan ini",
  last_month: "bulan lalu",
  this_year: "tahun ini",
  last_year: "tahun lalu",
};

export function periodLabel(period: PeriodSpec): string {
  return PERIOD_LABELS[period.kind];
}

// ─── Query core ──────────────────────────────────────────────────────────────

async function fetchCompletedOrders(
  ctx: ToolContext,
  range: DateRange,
): Promise<OrderRow[]> {
  const { data, error } = await ctx.supabase
    .from("orders")
    .select("id, invoice_no, order_date, customer_id, customer_name, subtotal, discount, total, status, notes, created_by, created_at, updated_at")
    .eq("status", "COMPLETED")
    .gte("order_date", range.from)
    .lte("order_date", range.to);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

async function fetchItemsForOrders(ctx: ToolContext, orderIds: string[]): Promise<OrderItemRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await ctx.supabase
    .from("order_items")
    .select("id, order_id, product_id, product_name, product_barcode, quantity, unit_price, price_tier, custom_price, discount_percent, subtotal, created_at")
    .in("order_id", orderIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderItemRow[];
}

function aggregateTopProducts(items: OrderItemRow[], limit: number): TopProduct[] {
  const byName = new Map<string, TopProduct>();
  for (const item of items) {
    const current = byName.get(item.product_name) ?? { name: item.product_name, quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.subtotal;
    byName.set(item.product_name, current);
  }
  return [...byName.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

function summarize(
  range: DateRange,
  period: PeriodSpec,
  orders: OrderRow[],
  items: OrderItemRow[],
  limit = 5,
): SalesSummary {
  const total = orders.reduce((s, o) => s + o.total, 0);
  const itemsSold = items.reduce((s, i) => s + i.quantity, 0);
  return {
    range,
    periodLabel: periodLabel(period),
    transactions: orders.length,
    total,
    itemsSold,
    avgPerTransaction: orders.length > 0 ? Math.round(total / orders.length) : 0,
    topProducts: aggregateTopProducts(items, limit),
  };
}

export async function runGetSales(
  period: PeriodSpec,
  ctx: ToolContext,
  topLimit = 5,
): Promise<ToolResult<SalesSummary>> {
  const range = periodRange(period);
  try {
    const orders = await fetchCompletedOrders(ctx, range);
    const items = await fetchItemsForOrders(ctx, orders.map((o) => o.id));
    return { ok: true, data: summarize(range, period, orders, items, topLimit) };
  } catch (e) {
    console.error(`[get_sales] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca data penjualan." };
  }
}

export async function runGetSalesSummary(
  period: PeriodSpec,
  ctx: ToolContext,
): Promise<ToolResult<SalesWithComparison>> {
  const range = periodRange(period);
  const prevPeriod = previousPeriod(period);
  const prevRange = periodRange(prevPeriod);
  try {
    const orders = await fetchCompletedOrders(ctx, range);
    const orderItems = await fetchItemsForOrders(ctx, orders.map((o) => o.id));
    const prevOrders = await fetchCompletedOrders(ctx, prevRange);
    const summary = summarize(range, period, orders, orderItems, 5);
    const previousTotal = prevOrders.reduce((s, o) => s + o.total, 0);
    return {
      ok: true,
      data: {
        ...summary,
        previousTotal,
        previousTransactions: prevOrders.length,
        deltaPercent:
          previousTotal > 0 ? Math.round(((summary.total - previousTotal) / previousTotal) * 1000) / 10 : null,
      },
    };
  } catch (e) {
    console.error(`[get_sales_summary] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca data penjualan." };
  }
}

export async function runGetTopSelling(
  period: PeriodSpec,
  ctx: ToolContext,
  limit = 5,
): Promise<ToolResult<{ period: PeriodSpec; items: TopProduct[] }>> {
  const range = periodRange(period);
  try {
    const orders = await fetchCompletedOrders(ctx, range);
    const items = await fetchItemsForOrders(ctx, orders.map((o) => o.id));
    return { ok: true, data: { period, items: aggregateTopProducts(items, limit) } };
  } catch (e) {
    console.error(`[get_top_selling] ${(e as Error).message}`);
    return { ok: false, code: "DB_ERROR", message: "Tidak dapat membaca data penjualan." };
  }
}

/** Convenience wrapper for today (spec: get_today_sales). */
export async function runGetTodaySales(ctx: ToolContext): Promise<ToolResult<SalesSummary>> {
  return runGetSales({ kind: "today" }, ctx);
}

export type { ToolFailure };
