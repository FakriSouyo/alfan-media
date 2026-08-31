// ─────────────────────────────────────────────────────────────────────────────
// Report tools (read-only). Compose the same building blocks as sales tools.
// Export (PDF/Excel) is not part of the current app, so the agent never
// claims to export.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTool, ToolContext, ToolResult } from "../types";
import type { PeriodSpec } from "../schemas/tools";
import {
  type SalesWithComparison,
  type TopProduct,
  periodLabel,
  runGetSalesSummary,
} from "./sales";

export const get_daily_report: AgentTool = {
  name: "get_daily_report",
  description: "Laporan penjualan harian.",
  risk: "read",
};

export const get_monthly_report: AgentTool = {
  name: "get_monthly_report",
  description: "Laporan penjualan bulanan + perbandingan bulan sebelumnya.",
  risk: "read",
};

export const get_sales_report: AgentTool = {
  name: "get_sales_report",
  description: "Laporan penjualan periode umum.",
  risk: "read",
};

export interface ReportData {
  period: PeriodSpec;
  periodLabel: string;
  summary: SalesWithComparison;
  topProducts: TopProduct[];
}

export async function runDailyReport(
  ctx: ToolContext,
): Promise<ToolResult<ReportData>> {
  return runReport({ kind: "today" }, ctx, "Harian");
}

export async function runMonthlyReport(
  period: PeriodSpec,
  ctx: ToolContext,
): Promise<ToolResult<ReportData>> {
  return runReport(period, ctx, "Bulanan");
}

export async function runSalesReport(
  period: PeriodSpec,
  ctx: ToolContext,
): Promise<ToolResult<ReportData>> {
  return runReport(period, ctx, "Penjualan");
}

async function runReport(
  period: PeriodSpec,
  ctx: ToolContext,
  kind: string,
): Promise<ToolResult<ReportData>> {
  const summary = await runGetSalesSummary(period, ctx);
  if (!summary.ok) return summary;
  const title = `${kind} ${periodLabel(period)}`;
  return {
    ok: true,
    data: {
      period,
      periodLabel: title,
      summary: summary.data,
      topProducts: summary.data.topProducts,
    },
  };
}
