import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import { getToken } from "./token";

const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Сервер недоступен");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code || String(res.status), err?.message || res.statusText);
  }
  return data as T;
}

const q = (o: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const realApi: ApiClient = {
  login: (email, password) => call("POST", "/auth/login", { email, password }),
  me: () => call("GET", "/me"),
  profile: () => call("GET", "/profile"),
  dashboard: () => call("GET", "/dashboard"),
  listRequests: (p = {}) => call("GET", `/requests${q({ scope: p.scope, status: p.status || undefined })}`),
  createRequest: (body) => call("POST", "/requests", body),
  getRequest: (id) => call("GET", `/requests/${id}`),
  approveRequest: (id, comment) => call("POST", `/requests/${id}/approve`, { comment }),
  rejectRequest: (id, comment) => call("POST", `/requests/${id}/reject`, { comment }),
  cancelRequest: (id) => call("POST", `/requests/${id}/cancel`),
  teamCalendar: (from, to) => call("GET", `/team/calendar${q({ from, to })}`),
  team: () => call("GET", "/team"),
  employee: (id) => call("GET", `/employees/${id}`),
  courses: () => call("GET", "/courses"),
  myEnrollments: () => call("GET", "/enrollments/mine"),
  course: (id) => call("GET", `/courses/${id}`),
  completeLesson: (eid, lid) => call("POST", `/enrollments/${eid}/lessons/${lid}/complete`),
  submitQuiz: (eid, answers) => call("POST", `/enrollments/${eid}/quiz`, { answers }),
  assignCourse: (body) => call("POST", "/enrollments", body),
  notifications: () => call("GET", "/notifications"),
  readNotification: (id) => call("POST", `/notifications/${id}/read`),
  readAllNotifications: () => call("POST", "/notifications/read-all"),
  kb: () => call("GET", "/kb"),
  escalate: (log_id) => call("POST", "/assistant/escalate", { log_id }),
  unanswered: () => call("GET", "/assistant/unanswered"),
  assistantStats: () => call("GET", "/assistant/stats"),
  sync1c: () => call("POST", "/integrations/1c/sync"),
  integrationsLog: () => call("GET", "/integrations/log"),
};
