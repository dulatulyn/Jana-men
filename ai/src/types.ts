export type Locale = "ru" | "kk";
export type AskStatus = "answered" | "no_answer" | "refused";
export type UserRole = "employee" | "manager" | "hr";

export interface Profile {
  full_name: string;
  company: string;
  position: string;
  department: string;
  manager: { id: number | string; full_name: string } | null;
  hire_date: string;
  vacation_balance_days: number;
  work_type?: string;
}

export interface KbArticle {
  slug: string;
  title: string;
  category: string;
  body_md: string;
  updated_at?: string;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Source {
  slug: string;
  title: string;
}

export interface Citation {
  slug: string;
  quote: string;
}

export type VacationPayload = { start_date: string; end_date: string; days: number; comment: string };
export type AdvancePayload = { amount: number | null; reason: string };

export type AssistantAction =
  | { type: "prefill_request"; request: { type: "vacation"; payload: VacationPayload } }
  | { type: "prefill_request"; request: { type: "advance"; payload: AdvancePayload } };

export interface AskResponse {
  status: AskStatus;
  answer: string;
  sources: Source[];
  action: AssistantAction | null;
  can_escalate: boolean;
  log_id: number | null;
  mode: "llm" | "fallback";
}

export const PROFILE_SOURCE: Source = { slug: "profile", title: "Мой профиль (1С:ЗУП)" };
