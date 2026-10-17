"use client";

import { useMemo } from "react";
import { api, isApiError } from "@/lib/api";
import type { CalendarEntry, RequestListItem, TeamMember } from "@/lib/api/types";
import { useSession } from "@/lib/session";
import { academyFromTeam, addDays, todayISO } from "@/lib/team";
import { useApi } from "./use-api";

export const useDashboard = () => useApi(() => api.dashboard(), "", "dashboard");
export const useProfile = () => useApi(() => api.profile(), "", "profile");
export const useMyRequests = () => useApi(() => api.listRequests({ scope: "mine" }), "", "requests:mine");
export const useCourses = () => useApi(() => api.courses(), "", "courses");
export const useMyEnrollments = () => useApi(() => api.myEnrollments(), "", "enrollments:mine");
export const useNotifications = () => useApi(() => api.notifications(), "", "notifications");
export const useKb = () => useApi(() => api.kb(), "", "kb");

export function useIsLead() {
  const { me } = useSession();
  return me?.role === "manager" || me?.role === "hr";
}

export function useTeam() {
  const lead = useIsLead();
  return useApi<TeamMember[]>(() => (lead ? api.team() : Promise.resolve([])), lead ? "on" : "off", "team");
}

export function useTeamRequests() {
  const lead = useIsLead();
  return useApi<RequestListItem[]>(() => (lead ? api.listRequests({ scope: "team" }) : Promise.resolve([])), lead ? "on" : "off", "requests:team");
}

export function useTeamOutlook() {
  const lead = useIsLead();
  const today = todayISO();
  const from = addDays(today, -30);
  const to = addDays(today, 330);
  return useApi<CalendarEntry[]>(() => (lead ? api.teamCalendar({ from, to }) : Promise.resolve([])), `${lead}:${from}`, "calendar:outlook");
}

export function useTeamAcademy() {
  const lead = useIsLead();
  return useApi(
    async () => {
      if (!lead) return [];
      try {
        return await api.teamAcademy();
      } catch (e) {
        if (!isApiError(e) || (e.status !== 404 && e.status !== 405)) throw e;
        const [team, courses] = await Promise.all([api.team(), api.courses()]);
        return academyFromTeam(team, courses);
      }
    },
    lead ? "on" : "off",
    "team-academy",
  );
}

export function useApprovalIds() {
  const { data } = useDashboard();
  return useMemo(() => {
    const ids = new Set<number>();
    for (const task of data?.tasks ?? []) {
      if (task.type !== "approve_request") continue;
      const m = task.link.match(/\/requests\/(\d+)/);
      if (m) ids.add(Number(m[1]));
    }
    return { ids, ready: !!data };
  }, [data]);
}
