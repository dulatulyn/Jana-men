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

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3 px-1", className)}>
      <h2 className="text-[17px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle, action, back }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.025em] sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-jm-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-2 inline-flex items-center gap-1 rounded-full text-[14px] font-medium text-jm-muted hover:text-jm-green">
      <ChevronRight className="size-4 rotate-180" />
      {label}
    </Link>
  );
}

export function Pill({ children, tone = "mint", className }: { children: React.ReactNode; tone?: "mint" | "green" | "amber" | "red" | "gray" | "outline" | "white"; className?: string }) {
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
      style={{ width: size, height: size, fontSize: size * 0.36 }}
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
      {iconNode ?? (Icon && <Icon className="size-[22px] shrink-0 text-jm-green" strokeWidth={1.75} />)}
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-medium", wrap ? "line-clamp-2 leading-snug" : "truncate")}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-jm-muted">{subtitle}</span>}
      </span>
      {meta}
      {chevron && (href || onClick) && <ChevronRight className="size-5 shrink-0 text-[#b6bdb9]" />}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors sm:px-5",
    (href || onClick) && "hover:bg-[#f8faf9] active:bg-jm-mint/50",
    className,
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn("divide-y divide-jm-line overflow-hidden", className)}>{children}</Card>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-[#e9edeb]", className)} />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[72px]" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-jm-mint">
        <Icon className="size-6 text-jm-green" strokeWidth={1.75} />
      </span>
      <p className="text-[16px] font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[14px] text-jm-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const forbidden = isApiError(error) && error.status === 403;
  if (forbidden) {
    return (
      <Card className="flex flex-col items-center px-6 py-12 text-center">
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
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-jm-amber-bg">
        <ShieldAlert className="size-6 text-jm-amber" strokeWidth={1.75} />
      </span>
      <p className="text-[16px] font-semibold">{isApiError(error) && error.status === 404 ? t.common.notFound : t.common.error}</p>
      {error instanceof Error && <p className="mt-1 max-w-sm text-[14px] text-jm-muted">{error.message}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold text-jm-green">
          <RefreshCw className="size-4" /> {t.common.retry}
        </button>
      )}
    </Card>
  );
}
