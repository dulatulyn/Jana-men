export type Role = "employee" | "manager" | "hr";
export type Locale = "ru" | "kk";
export type WorkType = "office" | "warehouse" | "courier";
export type RequestType = "vacation" | "advance";
export type RequestStatus =
  | "submitted"
  | "manager_approved"
  | "approved"
  | "rejected"
  | "cancelled";
export type EnrollmentStatus = "assigned" | "in_progress" | "completed";
export type AskStatus = "answered" | "no_answer" | "refused";

export interface User {
  id: number;
  email: string;
  password: string; // demo plaintext; prod → password_hash
  employee_id: number;
  role: Role;
  locale: Locale;
}

export interface Employee {
  id: number;
  external_id_1c: string;
  full_name: string;
  company: string;
  position: string;
  department_id: number;
  manager_id: number | null;
  hire_date: string;
  vacation_balance_days: number;
  phone: string;
  work_type: WorkType;
}

export interface Department {
  id: number;
  name: string;
  head_id: number | null;
}

export interface VacationPayload {
  start_date: string;
  end_date: string;
  days: number;
  comment?: string;
}
export interface AdvancePayload {
  amount: number;
  reason: string;
}
export type RequestPayload = VacationPayload | AdvancePayload;

export interface RequestRow {
  id: number;
  employee_id: number;
  type: RequestType;
  status: RequestStatus;
  payload: RequestPayload;
  created_at: string;
  updated_at: string;
  docflow_id: string | null;
  external_1c_id: string | null;
}

export interface RequestEvent {
  id: number;
  request_id: number;
  actor_id: number | null;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  comment: string | null;
  created_at: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  duration_min: number;
  cover: string;
}
export interface Lesson {
  id: number;
  course_id: number;
  order: number;
  title: string;
  content_md: string;
}
export interface QuizQuestion {
  id: number;
  course_id: number;
  text: string;
  options: string[];
  correct_index: number;
}
export interface Enrollment {
  id: number;
  employee_id: number;
  course_id: number;
  assigned_by: number | null;
  due_date: string | null;
  status: EnrollmentStatus;
  progress_pct: number;
  score: number | null;
  completed_at: string | null;
}
export interface LessonProgress {
  enrollment_id: number;
  lesson_id: number;
  completed_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface KbArticle {
  slug: string;
  title: string;
  category: string;
  body_md: string;
  updated_at: string;
}

export interface AssistantLog {
  id: number;
  user_id: number;
  question: string;
  answer: string;
  sources: { slug: string; title: string }[];
  status: AskStatus;
  escalated: boolean;
  created_at: string;
}

export interface IntegrationLogEntry {
  id: number;
  system: "1c_zup" | "documentolog";
  operation: string;
  status: "ok" | "error";
  details: string;
  created_at: string;
}
