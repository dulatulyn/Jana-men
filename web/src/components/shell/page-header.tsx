"use client";

import Link from "next/link";
import { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";

export interface HeaderSlots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
}

const SlotsCtx = createContext<HeaderSlots>({ title: null, actions: null });

export const HeaderSlotsProvider = SlotsCtx.Provider;

export interface BackTarget {
  href: string;
  label: string;
}

export function PageHeader({
  title,
  subtitle,
  back,
  badge,
  actions,
  mobileActions,
  mobileTitle,
  inlineSubtitle = true,
}: {
  title: string;
  mobileTitle?: string;
  inlineSubtitle?: boolean;
  subtitle?: React.ReactNode;
  back?: BackTarget;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  mobileActions?: React.ReactNode;
}) {
  const slots = useContext(SlotsCtx);

  useEffect(() => {
    document.title = `${title} · JanaMen`;
  }, [title]);

  const head = (
    <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-4">
      {back ? (
        <Link
          href={back.href}
          aria-label={back.label}
          className="group flex size-9 shrink-0 items-center justify-center rounded-full text-jm-ink transition-colors hover:bg-jm-page lg:h-10 lg:w-auto lg:gap-2 lg:border lg:border-jm-line lg:bg-white lg:pr-4 lg:pl-3 lg:hover:border-jm-light lg:hover:bg-white"
        >
          <ArrowLeft className="size-[19px] transition-transform group-hover:-translate-x-0.5" strokeWidth={2} />
          <span className="hidden text-[14px] font-semibold lg:inline">{back.label}</span>
        </Link>
      ) : (
        <LogoMark size={28} className="lg:hidden" />
      )}
      {back && <span className="hidden h-6 w-px shrink-0 bg-jm-line lg:block" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[17px] leading-tight font-semibold tracking-[-0.015em] lg:text-[20px] lg:font-bold lg:tracking-[-0.02em]">
            {mobileTitle ? (
              <>
                <span className="lg:hidden">{mobileTitle}</span>
                <span className="hidden lg:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </h1>
          {badge && <span className="hidden shrink-0 items-center gap-2 sm:flex">{badge}</span>}
        </div>
        {subtitle && <p className="mt-0.5 hidden truncate text-[13px] leading-tight text-jm-muted lg:block">{subtitle}</p>}
      </div>
    </div>
  );

  const mobile = mobileActions ?? actions;
  const sub = inlineSubtitle ? subtitle : undefined;
  const showInline = Boolean(sub || mobile || badge);

  return (
    <>
      {slots.title && createPortal(head, slots.title)}
      {slots.actions && actions && createPortal(<div className="hidden items-center gap-2 lg:flex">{actions}</div>, slots.actions)}
      {showInline && (
        <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:hidden")}>
          {(sub || badge) && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {badge && <span className="flex items-center gap-2 sm:hidden">{badge}</span>}
              {sub && <p className="text-[14px] text-jm-muted">{sub}</p>}
            </div>
          )}
          {mobile && <div className="flex shrink-0 flex-wrap gap-2">{mobile}</div>}
        </div>
      )}
    </>
  );
}
