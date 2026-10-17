import { Bell, ClipboardCheck, FileText, GraduationCap, House, LayoutDashboard, MessagesSquare, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/api/types";
import type { Dict } from "@/i18n/ru";

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  badge?: "approvals" | "notifications";
}

export function navFor(role: Role, t: Dict): NavItem[] {
  const items: NavItem[] = [{ href: "/dashboard", label: t.nav.home, icon: House }];
  if (role !== "employee") items.push({ href: "/approvals", label: t.nav.approvals, icon: ClipboardCheck, badge: "approvals" });
  items.push({ href: "/requests", label: t.nav.requests, short: t.nav.requestsShort, icon: FileText });
  if (role === "manager") items.push({ href: "/team", label: t.nav.team, icon: Users });
  if (role === "hr") items.push({ href: "/hr", label: t.nav.hr, icon: LayoutDashboard });
  items.push(
    { href: "/academy", label: t.nav.academy, icon: GraduationCap },
    { href: "/assistant", label: t.nav.assistant, short: t.nav.assistantShort, icon: MessagesSquare },
    { href: "/notifications", label: t.nav.notifications, icon: Bell, badge: "notifications" },
    { href: "/profile", label: t.nav.profile, icon: UserRound },
  );
  return items;
}

export function bottomFor(role: Role, t: Dict) {
  const all = navFor(role, t);
  const pick = (h: string) => all.find((i) => i.href === h)!;
  const main =
    role === "employee"
      ? ["/dashboard", "/requests", "/assistant", "/academy", "/profile"]
      : ["/dashboard", "/approvals", "/assistant", "/academy"];
  const items = main.map(pick);
  const rest = all.filter((i) => !main.includes(i.href) && i.href !== "/notifications");
  return { items, rest };
}

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
