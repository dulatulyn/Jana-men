"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, MessagesSquare, MoreHorizontal, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/shared/ui";
import { Splash } from "./splash";
import { bottomFor, isActive, navFor, type NavItem } from "./nav";
import { LangSwitch } from "./lang-switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssistantDock } from "@/components/assistant/assistant-dock";

function useCounters() {
  const { data } = useApi(() => api.dashboard());
  return {
    notifications: data?.unread_notifications ?? 0,
    approvals: data?.tasks.filter((x) => x.type === "approve_request").length ?? 0,
  };
}

function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-jm-green px-1.5 text-[11px] font-bold text-white tabular", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Sidebar({ items, counters }: { items: NavItem[]; counters: ReturnType<typeof useCounters> }) {
  const pathname = usePathname();
  const { me, logout } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  if (!me) return null;
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-jm-line bg-white lg:flex">
      <Link href="/dashboard" className="flex h-[76px] items-center px-7 text-[22px]">
        <Logo />
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          const n = i.badge ? counters[i.badge] : 0;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-medium transition-colors",
                active ? "bg-jm-mint text-jm-green-strong" : "text-jm-ink/80 hover:bg-[#f4f6f5] hover:text-jm-ink",
              )}
            >
              <i.icon className={cn("size-[20px]", active ? "text-jm-green" : "text-jm-green/80")} strokeWidth={active ? 2.1 : 1.75} />
              <span className="flex-1">{i.label}</span>
              <Count n={n} />
            </Link>
          );
        })}
      </nav>
      <div className="m-3 flex items-center gap-3 rounded-[18px] bg-[#f6f8f7] p-3">
        <Avatar name={me.full_name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{me.full_name}</p>
          <p className="truncate text-[12px] text-jm-muted">{t.roles[me.role]}</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex size-9 items-center justify-center rounded-full text-jm-muted hover:bg-white hover:text-jm-red"
          aria-label={t.common.logout}
          title={t.common.logout}
        >
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}

function BellLink({ n }: { n: number }) {
  const { t } = useI18n();
  return (
    <Link
      href="/notifications"
      aria-label={t.nav.notifications}
      className="relative flex size-10 items-center justify-center rounded-full bg-white text-jm-ink transition-colors hover:text-jm-green"
    >
      <Bell className="size-[20px]" strokeWidth={1.8} />
      {n > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-jm-page bg-jm-green px-1 text-[10px] font-bold text-white tabular">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </Link>
  );
}

function UserMenu() {
  const { me, logout } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-jm-light" aria-label={t.nav.profile}>
        <Avatar name={me.full_name} size={40} className="bg-white" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl p-1.5">
        <DropdownMenuLabel className="px-2.5 py-2">
          <p className="text-[14px] font-semibold text-jm-ink">{me.full_name}</p>
          <p className="text-[12px] font-normal text-jm-muted">
            {t.roles[me.role]} · {me.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl px-2.5 py-2 text-[14px]" onSelect={() => router.push("/profile")}>
          <UserRound className="text-jm-green" /> {t.nav.profile}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl px-2.5 py-2 text-[14px]"
          onSelect={() => {
            logout();
            router.replace("/login");
          }}
        >
          <LogOut className="text-jm-muted" /> {t.common.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomNav({ counters }: { counters: ReturnType<typeof useCounters> }) {
  const { me, logout } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  if (!me) return null;
  const { items, rest } = bottomFor(me.role, t);
  const hasMore = me.role !== "employee";
  const moreActive = rest.some((r) => isActive(pathname, r.href));

  const cell = "relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium";
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-jm-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl">
          {items.map((i) => {
            const active = isActive(pathname, i.href);
            const n = i.badge ? counters[i.badge] : 0;
            return (
              <Link key={i.href} href={i.href} className={cn(cell, active ? "text-jm-green" : "text-jm-muted")}>
                <span className="relative">
                  <i.icon className="size-[23px]" strokeWidth={active ? 2.1 : 1.7} />
                  {n > 0 && <Count n={n} className="absolute -top-1.5 -right-3 h-[17px] min-w-[17px] px-1 text-[10px]" />}
                </span>
                <span className="max-w-full truncate px-1">{i.short ?? i.label}</span>
              </Link>
            );
          })}
          {hasMore && (
            <button onClick={() => setMore(true)} className={cn(cell, moreActive ? "text-jm-green" : "text-jm-muted")}>
              <MoreHorizontal className="size-[23px]" strokeWidth={1.7} />
              <span>{t.nav.more}</span>
            </button>
          )}
        </div>
      </nav>
      {hasMore && (
        <Sheet open={more} onOpenChange={setMore}>
          <SheetContent side="bottom" className="rounded-t-[24px] border-0 px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <SheetTitle className="px-3 text-[17px] font-semibold">{t.nav.more}</SheetTitle>
            <div className="divide-y divide-jm-line">
              {rest.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setMore(false)} className="flex items-center gap-3.5 px-3 py-3.5 text-[15px] font-medium">
                  <i.icon className="size-[22px] text-jm-green" strokeWidth={1.75} />
                  {i.label}
                </Link>
              ))}
              <button
                onClick={() => {
                  setMore(false);
                  logout();
                  router.replace("/login");
                }}
                className="flex w-full items-center gap-3.5 px-3 py-3.5 text-[15px] font-medium text-jm-muted"
              >
                <LogOut className="size-[22px]" strokeWidth={1.75} />
                {t.common.logout}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const counters = useCounters();

  useEffect(() => {
    if (ready && !me) router.replace("/login");
  }, [ready, me, router]);

  if (!ready || !me) return <Splash />;

  const items = navFor(me.role, t);
  const onAssistant = pathname.startsWith("/assistant");

  return (
    <div className="min-h-dvh">
      <Sidebar items={items} counters={counters} />
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 bg-jm-page/85 backdrop-blur-md">
          <div className="mx-auto flex h-[64px] max-w-[1180px] items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:px-10">
            <Link href="/dashboard" className="text-[18px] lg:hidden">
              <Logo />
            </Link>
            <div className="flex-1" />
            <LangSwitch />
            <BellLink n={counters.notifications} />
            <div className="hidden lg:block">
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1180px] px-4 pt-1 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pb-16">{children}</main>
      </div>
      <BottomNav counters={counters} />
      {!onAssistant && <AssistantDock label={t.assistant.floating} icon={<MessagesSquare />} />}
    </div>
  );
}
