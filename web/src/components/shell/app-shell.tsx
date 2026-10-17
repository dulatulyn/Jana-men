"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, LogOut, MessagesSquare, MoreHorizontal, UserRound } from "lucide-react";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { useDashboard } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/shared/ui";
import { Splash } from "./splash";
import { bottomFor, isActive, navGroups, type NavItem } from "./nav";
import { LangSwitch } from "./lang-switch";
import { HeaderSlotsProvider } from "./page-header";
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
  const { data } = useDashboard();
  return {
    notifications: data?.unread_notifications ?? 0,
    approvals: data?.tasks.filter((x) => x.type === "approve_request").length ?? 0,
  };
}

type Counters = ReturnType<typeof useCounters>;

function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-jm-green px-1.5 text-[11px] font-bold text-white tabular", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function useLogout() {
  const { logout } = useSession();
  const router = useRouter();
  return () => {
    logout();
    router.replace("/login");
  };
}

function SideLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-full px-3 text-[14.5px] font-medium transition-colors",
        active ? "bg-jm-mint text-jm-green-strong" : "text-jm-ink/75 hover:bg-jm-page hover:text-jm-ink",
      )}
    >
      <item.icon className={cn("size-[19px] shrink-0", active ? "text-jm-green" : "text-jm-green/75 group-hover:text-jm-green")} strokeWidth={active ? 2.1 : 1.8} />
      <span className="flex-1 truncate">{item.label}</span>
      <Count n={count} />
    </Link>
  );
}

function Sidebar({ counters }: { counters: Counters }) {
  const pathname = usePathname();
  const { me } = useSession();
  const { t } = useI18n();
  const logout = useLogout();
  if (!me) return null;
  const groups = navGroups(me.role, t);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--sidebar-w) flex-col border-r border-jm-line bg-white lg:flex">
      <div className="flex h-(--header-h) shrink-0 items-center border-b border-jm-line px-6">
        <Link href="/dashboard" className="rounded-xl outline-offset-4">
          <Logo size={30} />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-3" aria-label={t.nav.menu}>
        {groups.map((g, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-5")}>
            {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.08em] text-jm-muted/80 uppercase">{g.label}</p>}
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <SideLink key={i.href} item={i} active={isActive(pathname, i.href)} count={i.badge ? counters[i.badge] : 0} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-jm-line p-3">
        <div className="flex items-center gap-3 rounded-2xl p-2 pl-2.5 transition-colors hover:bg-jm-page">
          <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={me.full_name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{me.full_name}</span>
              <span className="block truncate text-[12px] text-jm-muted">{t.roles[me.role]}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-jm-muted transition-colors hover:bg-white hover:text-jm-red"
            aria-label={t.common.logout}
            title={t.common.logout}
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function BellLink({ n }: { n: number }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <Link
      href="/notifications"
      aria-label={n ? `${t.nav.notifications}: ${n}` : t.nav.notifications}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-jm-page hover:text-jm-green",
        isActive(pathname, "/notifications") ? "bg-jm-mint text-jm-green" : "text-jm-ink",
      )}
    >
      <Bell className="size-[19px]" strokeWidth={1.8} />
      {n > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-jm-green px-1 text-[10px] font-bold text-white tabular">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </Link>
  );
}

function UserMenu() {
  const { me } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const logout = useLogout();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-jm-light" aria-label={t.nav.profile}>
        <Avatar name={me.full_name} size={36} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-2xl p-1.5">
        <DropdownMenuLabel className="px-2.5 py-2">
          <p className="truncate text-[14px] font-semibold text-jm-ink">{me.full_name}</p>
          <p className="truncate text-[12px] font-normal text-jm-muted">
            {t.roles[me.role]} · {me.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl px-2.5 py-2 text-[14px]" onSelect={() => router.push("/profile")}>
          <UserRound className="text-jm-green" /> {t.nav.profile}
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl px-2.5 py-2 text-[14px]" onSelect={logout}>
          <LogOut className="text-jm-muted" /> {t.common.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomNav({ counters }: { counters: Counters }) {
  const { me } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const logout = useLogout();
  const [more, setMore] = useState(false);
  if (!me) return null;
  const { items, rest } = bottomFor(me.role, t);
  const hasMore = rest.length > 0 && me.role !== "employee";
  const moreActive = rest.some((r) => isActive(pathname, r.href));
  const moreCount = rest.reduce((s, r) => s + (r.badge ? counters[r.badge] : 0), 0);

  const cell = "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-medium";
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-jm-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t.nav.menu}>
        <div className="mx-auto flex max-w-xl">
          {items.map((i) => {
            const active = isActive(pathname, i.href);
            const n = i.badge ? counters[i.badge] : 0;
            return (
              <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn(cell, active ? "text-jm-green" : "text-jm-muted")}>
                <span className="relative">
                  <i.icon className="size-[23px]" strokeWidth={active ? 2.1 : 1.7} />
                  {n > 0 && <Count n={n} className="absolute -top-1.5 -right-3 h-[17px] min-w-[17px] px-1 text-[10px]" />}
                </span>
                <span className="max-w-full truncate px-1">{i.short ?? i.label}</span>
              </Link>
            );
          })}
          {hasMore && (
            <button type="button" onClick={() => setMore(true)} className={cn(cell, moreActive ? "text-jm-green" : "text-jm-muted")}>
              <span className="relative">
                <MoreHorizontal className="size-[23px]" strokeWidth={1.7} />
                {moreCount > 0 && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-white bg-jm-green" />}
              </span>
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
              {rest.map((i) => {
                const n = i.badge ? counters[i.badge] : 0;
                return (
                  <Link key={i.href} href={i.href} onClick={() => setMore(false)} className="flex items-center gap-3.5 px-3 py-3.5 text-[15px] font-medium">
                    <i.icon className="size-[22px] text-jm-green" strokeWidth={1.75} />
                    <span className="flex-1">{i.label}</span>
                    <Count n={n} />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  logout();
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
  const [titleEl, setTitleEl] = useState<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(() => ({ title: titleEl, actions: actionsEl }), [titleEl, actionsEl]);

  useEffect(() => {
    if (ready && !me) router.replace("/login");
  }, [ready, me, router]);

  if (!ready || !me) return <Splash />;

  const onAssistant = pathname.startsWith("/assistant");

  return (
    <div className="min-h-dvh">
      <Sidebar counters={counters} />
      <div className="lg:pl-(--sidebar-w)">
        <header className="sticky top-0 z-20 h-(--header-h) border-b border-jm-line bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
          <div className="page-container flex h-full items-center gap-2 sm:gap-3">
            <div ref={setTitleEl} className="flex min-w-0 flex-1 items-center" />
            <div
              ref={setActionsEl}
              className="hidden items-center gap-3 after:mr-1 after:h-6 after:w-px after:bg-jm-line after:content-[''] empty:hidden lg:flex"
            />
            <LangSwitch size="sm" className="sm:hidden" />
            <LangSwitch className="hidden sm:flex" />
            <BellLink n={counters.notifications} />
            <div className="hidden lg:block">
              <UserMenu />
            </div>
          </div>
        </header>
        <HeaderSlotsProvider value={slots}>
          <main className="page-container pt-(--page-y) pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-28">{children}</main>
        </HeaderSlotsProvider>
      </div>
      <BottomNav counters={counters} />
      {!onAssistant && <AssistantDock label={me.role === "hr" ? t.nav.assistant : t.assistant.floating} icon={<MessagesSquare />} />}
    </div>
  );
}
