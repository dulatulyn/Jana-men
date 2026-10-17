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

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function navGroups(role: Role, t: Dict): NavGroup[] {
  const home: NavItem = { href: "/dashboard", label: t.nav.home, icon: House };
  const personal: NavItem[] = [
    { href: "/requests", label: t.nav.requests, short: t.nav.requestsShort, icon: FileText },
    { href: "/academy", label: t.nav.academy, icon: GraduationCap },
    { href: "/assistant", label: t.nav.assistant, short: t.nav.assistantShort, icon: MessagesSquare },
    { href: "/notifications", label: t.nav.notifications, icon: Bell, badge: "notifications" },
    { href: "/profile", label: t.nav.profile, icon: UserRound },
  ];
  if (role === "employee") return [{ items: [home, ...personal] }];
  const manage: NavItem[] = [{ href: "/approvals", label: t.nav.approvals, icon: ClipboardCheck, badge: "approvals" }];
  if (role === "manager") manage.push({ href: "/team", label: t.nav.team, short: t.nav.teamShort, icon: Users });
  if (role === "hr") manage.push({ href: "/hr", label: t.nav.hr, icon: LayoutDashboard });
  return [{ items: [home] }, { label: t.nav.groupManage, items: manage }, { label: t.nav.groupPersonal, items: personal }];
}

export const navFor = (role: Role, t: Dict) => navGroups(role, t).flatMap((g) => g.items);

export function bottomFor(role: Role, t: Dict) {
  const all = navFor(role, t);
  const pick = (h: string) => all.find((i) => i.href === h)!;
  const main =
    role === "employee"
      ? ["/dashboard", "/requests", "/assistant", "/academy", "/profile"]
      : role === "manager"
        ? ["/dashboard", "/approvals", "/team", "/assistant"]
        : ["/dashboard", "/approvals", "/hr", "/assistant"];
  const items = main.map(pick);
  const rest = all.filter((i) => !main.includes(i.href));
  return { items, rest };
}

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
