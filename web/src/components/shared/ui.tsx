"use client";

import Link from "next/link";
import { ChevronRight, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { isApiError } from "@/lib/api";
import { useT } from "@/i18n";

export function Card({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-[20px] bg-white", className)} {...p} />;
}

export function Panel({
  title,
  header,
  icon: Icon,
  count,
  action,
  children,
  className,
  bodyClassName,
  footer,
  divider = true,
  id,
}: {
  title?: React.ReactNode;
  header?: React.ReactNode;
  icon?: LucideIcon;
  count?: number;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
  divider?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex min-w-0 flex-col overflow-hidden rounded-[20px] bg-white", className)}>
      {(title || header || action) && (
        <header className={cn("flex min-h-[56px] shrink-0 items-center justify-between gap-3 px-5", divider && "border-b border-jm-line")}>
          {header ? (
            <div className="min-w-0 flex-1">{header}</div>
          ) : (
          <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            {Icon && <Icon className="size-[18px] shrink-0 text-jm-green" strokeWidth={1.9} />}
            <span className="truncate">{title}</span>
            {count !== undefined && count > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-jm-mint px-1.5 text-[11.5px] font-bold text-jm-green-strong tabular">{count}</span>
            )}
          </h2>
          )}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
      {footer}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-0.5 rounded-full text-[13px] font-semibold text-jm-green hover:text-jm-green-strong">
      {children}
      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function PanelEmpty({ icon: Icon, title, hint, action, className }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-[148px] flex-col items-center justify-center px-6 py-8 text-center", className)}>
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-jm-mint">
        <Icon className="size-5 text-jm-green" strokeWidth={1.8} />
      </span>
      <p className="text-[14.5px] font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[13px] text-jm-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  href,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "green" | "amber" | "red" | "gray";
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    green: "bg-jm-mint text-jm-green",
    amber: "bg-jm-amber-bg text-jm-amber",
    red: "bg-jm-red-bg text-jm-red",
    gray: "bg-[#eef1ef] text-jm-muted",
  } as const;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-jm-muted">{label}</p>
        {Icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tones[tone])}>
            <Icon className="size-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-1 text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular sm:text-[30px]">{value}</p>
      {hint && <div className="mt-2 text-[12.5px] text-jm-muted">{hint}</div>}
      {children}
    </>
  );
  const cls = cn("flex h-full min-w-0 flex-col rounded-[20px] bg-white p-4 sm:p-5", href && "transition-colors hover:bg-[#fbfcfb]", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Pill({
  children,
  tone = "mint",
  className,
}: {
  children: React.ReactNode;
  tone?: "mint" | "green" | "amber" | "red" | "gray" | "outline" | "white";
  className?: string;
}) {
  const tones = {
    mint: "bg-jm-mint text-jm-green-strong",
    green: "bg-jm-green text-white",
    amber: "bg-jm-amber-bg text-jm-amber",
    red: "bg-jm-red-bg text-jm-red",
    gray: "bg-[#eef0ef] text-jm-muted",
    outline: "border border-jm-light/60 text-jm-green-strong",
    white: "bg-white/20 text-white",
  } as const;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-jm-mint font-semibold text-jm-green-strong", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Row({
  href,
  onClick,
  icon: Icon,
  iconNode,
  title,
  subtitle,
  meta,
  chevron = true,
  wrap = false,
  className,
}: {
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  iconNode?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  chevron?: boolean;
  wrap?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      {iconNode ?? (Icon && <Icon className="size-[20px] shrink-0 text-jm-green" strokeWidth={1.8} />)}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px] font-medium", wrap ? "line-clamp-2 leading-snug" : "truncate")}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-jm-muted">{subtitle}</span>}
      </span>
      {meta}
      {chevron && (href || onClick) && <ChevronRight className="size-[18px] shrink-0 text-[#b6bdb9]" />}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors",
    (href || onClick) && "hover:bg-[#f8faf9] active:bg-jm-mint/50",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-jm-line", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-[#e9edeb]", className)} />;
}

export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-jm-line", className)} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-3/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action, className }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-jm-mint">
        <Icon className="size-6 text-jm-green" strokeWidth={1.75} />
      </span>
      <p className="text-[16px] font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[14px] text-jm-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const t = useT();
  const forbidden = isApiError(error) && error.status === 403;
  if (forbidden) {
    return (
      <Card className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-jm-red-bg">
          <Lock className="size-6 text-jm-red" strokeWidth={1.75} />
        </span>
        <p className="text-[16px] font-semibold">{t.common.noAccessTitle}</p>
        <p className="mt-1 max-w-sm text-[14px] text-jm-muted">{t.common.noAccessBody}</p>
        <p className="mt-4 rounded-full bg-[#f2f4f3] px-3 py-1 text-[12.5px] text-jm-muted">
          <span className="font-mono font-semibold">403</span> · {(error as Error).message}
        </p>
      </Card>
    );
  }
  return (
    <Card className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-jm-amber-bg">
        <ShieldAlert className="size-6 text-jm-amber" strokeWidth={1.75} />
      </span>
      <p className="text-[16px] font-semibold">{isApiError(error) && error.status === 404 ? t.common.notFound : t.common.error}</p>
      {error instanceof Error && <p className="mt-1 max-w-sm text-[14px] text-jm-muted">{error.message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold text-jm-green">
          <RefreshCw className="size-4" /> {t.common.retry}
        </button>
      )}
    </Card>
  );
}
