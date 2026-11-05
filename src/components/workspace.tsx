import type { InputHTMLAttributes, ReactNode } from "react";
import { Inbox, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/navigation";

export function Metrics({ items }: { items: { label: string; value: ReactNode; note?: string; tone?: "accent" | "warning" }[] }) {
  return <dl className="workspace-metrics">{items.map((item) => <div key={item.label} className={cn("workspace-metric", item.tone && `metric-${item.tone}`)}>
    <dt>{item.label}</dt><dd>{item.value}</dd>{item.note && <p>{item.note}</p>}
  </div>)}</dl>;
}

export function PanelHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="panel-heading"><div className="min-w-0"><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</div>;
}

export function SearchField({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <div className={cn("workspace-search", className)}><Search size={17} aria-hidden="true" /><input type="search" aria-label={label} placeholder={label} {...props} /></div>;
}

export function EmptyPanel({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="workspace-empty" role="status"><Inbox size={28} strokeWidth={1.4} aria-hidden="true" /><h3>{title}</h3><p>{description}</p>{children}</div>;
}

const statuses: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, CHECKED_OUT: { label: "Diproses", tone: "blue" },
  COMPLETED: { label: "Selesai", tone: "green" }, CANCELLED: { label: "Dibatalkan", tone: "red" },
};
export function OrderStatus({ status }: { status: string }) {
  const value = statuses[status] ?? { label: status, tone: "neutral" };
  return <span className={`status-pill status-${value.tone}`}><span aria-hidden="true" />{value.label}</span>;
}

export function ReportNav({ active }: { active: "sales" | "inventory" }) {
  return <nav className="workspace-tabs" aria-label="Jenis laporan">
    <Link href="/reports/sales" aria-current={active === "sales" ? "page" : undefined}>Penjualan</Link>
    <Link href="/reports/inventory" aria-current={active === "inventory" ? "page" : undefined}>Inventaris</Link>
  </nav>;
}
