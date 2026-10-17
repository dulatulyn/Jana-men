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

export interface PersonRef {
  id: number;
  full_name: string;
}


export interface AuthUser {
  id: number;
  role: Role;
  employee_id: number;
  full_name: string;
  locale: Locale;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
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

export interface Me extends AuthUser {
  email: string;
  employee: Employee;
}


export interface Profile {
  full_name: string;
  company: string;
  position: string;
  department: string;
  manager: PersonRef | null;
  hire_date: string;
  vacation_balance_days: number;
  work_type: WorkType;
}

export interface Task {
  type: string;
  title: string;
  link: string;
  due: string | null;
}

export interface Dashboard {
  profile: Profile;
  tasks: Task[];
  active_requests: RequestListItem[];
  enrollments: Enrollment[];
  unread_notifications: number;
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

export interface RequestListItem {
  id: number;
  type: RequestType;
  status: RequestStatus;
  created_at: string;
  employee: PersonRef;
  summary: string;
}

export interface RequestEvent {
  id: number;
  request_id: number;
  actor_id: number | null;
  actor?: PersonRef | null;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  comment: string | null;
  created_at: string;
}

export interface HRRequest {
  id: number;
  employee_id: number;
  employee: PersonRef;
  type: RequestType;
  status: RequestStatus;
  payload: RequestPayload;
  created_at: string;
  updated_at: string;
  docflow_id: string | null;
  external_1c_id: string | null;
}

export interface RequestDetail extends HRRequest {
  events: RequestEvent[];
}

export type CreateRequestBody =
  | { type: "vacation"; payload: VacationPayload }
  | { type: "advance"; payload: AdvancePayload };

export interface RequestListParams {
  scope?: "mine" | "team" | "all";
  status?: RequestStatus | "";
}

export interface CalendarEntry {
  employee: PersonRef;
  start_date: string;
  end_date: string;
  status: RequestStatus;
}


export interface TeamMember {
  id: number;
  full_name: string;
  position: string;
  department: string;
  work_type: WorkType;
  hire_date: string;
  vacation_balance_days: number;
  enrollments: Enrollment[];
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
}

export interface Enrollment {
  id: number;
  employee_id: number;
  course_id: number;
  course?: Course;
  assigned_by: number | null;
  due_date: string | null;
  status: EnrollmentStatus;
  progress_pct: number;
  score: number | null;
  completed_at: string | null;
  completed_lesson_ids?: number[];
}

export interface CourseDetail extends Course {
  lessons: Lesson[];
  quiz: QuizQuestion[];
  enrollment: Enrollment | null;
}

export interface QuizResult {
  score: number;
  passed: boolean;
  correct: number[];
}

export interface AssignCourseBody {
  employee_id: number;
  course_id: number;
  due_date: string | null;
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

export interface UnansweredQuestion {
  question: string;
  count: number;
  last_asked_at: string;
}

export interface AssistantStats {
  total: number;
  answered: number;
  no_answer: number;
  refused: number;
  escalated: number;
}


export interface SyncResult {
  synced: number;
  at: string;
}

export interface IntegrationLogEntry {
  id: number;
  system: "1c_zup" | "documentolog";
  operation: string;
  status: "ok" | "error";
  details: string;
  created_at: string;
}


export type AskStatus = "answered" | "no_answer" | "refused";

export interface AskSource {
  slug: string;
  title: string;
}

export interface PrefillAction {
  type: "prefill_request";
  request:
    | { type: "vacation"; payload: Partial<VacationPayload> }
    | { type: "advance"; payload: Partial<AdvancePayload> };
}

export interface AskResponse {
  status: AskStatus;
  answer: string;
  sources: AskSource[];
  action: PrefillAction | null;
  can_escalate: boolean;
  log_id: number | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}


export interface ApiErrorBody {
  error: { code: string; message: string };
}
