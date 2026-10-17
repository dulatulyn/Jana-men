import type { AskStatus, KbArticle, Profile, Source } from "../types.js";

export class UnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
  }
}

export interface LogEntry {
  question: string;
  answer: string;
  status: AskStatus;
  sources: Source[];
}

export interface BackendClient {
  getProfile(authHeader: string): Promise<Profile>;
  getKb(authHeader: string): Promise<KbArticle[]>;
  log(authHeader: string, entry: LogEntry): Promise<number | null>;
  escalate(authHeader: string, logId: number): Promise<unknown>;
}
