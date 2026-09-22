import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
