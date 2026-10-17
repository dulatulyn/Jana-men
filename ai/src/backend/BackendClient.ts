import type { AskStatus, KbArticle, Profile, Source, UserRole } from "../types.js";

export class UnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
  }
}

export interface BackendErrorBody {
  error: { code: string; message: string };
}

export class BackendError extends Error {
  constructor(public status: number, message: string, public body: BackendErrorBody | null = null) {
    super(message);
  }
}

export interface LogEntry {
  question: string;
  answer: string;
  status: AskStatus;
  sources: Source[];
}

export interface Me {
  role: UserRole;
}

export interface BackendClient {
  getProfile(authHeader: string): Promise<Profile>;
  getKb(authHeader: string): Promise<KbArticle[]>;
  getMe(authHeader: string): Promise<Me>;
  log(authHeader: string, entry: LogEntry): Promise<number | null>;
  escalate(authHeader: string, logId: number): Promise<unknown>;
}

export function toRole(v: unknown): UserRole {
  return v === "manager" || v === "hr" ? v : "employee";
}
