import type {
  AssignCourseBody,
  AssistantStats,
  CalendarEntry,
  CalendarParams,
  Course,
  CourseDetail,
  CreateRequestBody,
  Dashboard,
  EmployeeDetail,
  Enrollment,
  HRRequest,
  IntegrationLogEntry,
  KbArticle,
  KbUpsertBody,
  LoginResponse,
  Me,
  Notification,
  Profile,
  QuizResult,
  RequestDetail,
  RequestListItem,
  RequestListParams,
  RetryResult,
  SyncResult,
  TeamAcademyCourse,
  TeamMember,
  UnansweredQuestion,
} from "./types";

export interface ApiClient {
  login(email: string, password: string): Promise<LoginResponse>;
  me(): Promise<Me>;
  profile(): Promise<Profile>;
  dashboard(): Promise<Dashboard>;
  listRequests(params?: RequestListParams): Promise<RequestListItem[]>;
  createRequest(body: CreateRequestBody): Promise<HRRequest>;
  getRequest(id: number): Promise<RequestDetail>;
  approveRequest(id: number, comment?: string): Promise<HRRequest>;
  rejectRequest(id: number, comment: string): Promise<HRRequest>;
  cancelRequest(id: number): Promise<HRRequest>;
  teamCalendar(params?: CalendarParams): Promise<CalendarEntry[]>;
  team(): Promise<TeamMember[]>;
  teamAcademy(): Promise<TeamAcademyCourse[]>;
  employee(id: number): Promise<EmployeeDetail>;
  courses(): Promise<Course[]>;
  myEnrollments(): Promise<Enrollment[]>;
  course(id: number): Promise<CourseDetail>;
  completeLesson(enrollmentId: number, lessonId: number): Promise<Enrollment>;
  submitQuiz(enrollmentId: number, answers: number[]): Promise<QuizResult>;
  assignCourse(body: AssignCourseBody): Promise<Enrollment>;
  notifications(): Promise<Notification[]>;
  readNotification(id: number): Promise<void>;
  readAllNotifications(): Promise<void>;
  kb(): Promise<KbArticle[]>;
  upsertKb(slug: string, body: KbUpsertBody): Promise<KbArticle>;
  escalate(logId: number): Promise<void>;
  unanswered(): Promise<UnansweredQuestion[]>;
  assistantStats(): Promise<AssistantStats>;
  sync1c(): Promise<SyncResult>;
  integrationsLog(): Promise<IntegrationLogEntry[]>;
  retryIntegration(id: number): Promise<RetryResult>;
}
