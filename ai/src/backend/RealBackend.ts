import type { KbArticle, Profile } from "../types.js";
import { UnauthorizedError, type BackendClient, type LogEntry } from "./BackendClient.js";

export class BackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class RealBackend implements BackendClient {
  private kbCache: { at: number; data: KbArticle[] } | null = null;

  constructor(private baseUrl: string, private kbTtlMs = 60_000, private timeoutMs = 5_000) {}

  private async call<T>(authHeader: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: authHeader, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new BackendError(res.status, `${method} ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  getProfile(authHeader: string): Promise<Profile> {
    return this.call<Profile>(authHeader, "GET", "/profile");
  }

  async getKb(authHeader: string): Promise<KbArticle[]> {
    if (this.kbCache && Date.now() - this.kbCache.at < this.kbTtlMs) return this.kbCache.data;
    const data = await this.call<KbArticle[]>(authHeader, "GET", "/kb");
    this.kbCache = { at: Date.now(), data };
    return data;
  }

  async log(authHeader: string, entry: LogEntry): Promise<number | null> {
    const r = await this.call<{ log_id?: number; id?: number }>(authHeader, "POST", "/assistant/logs", entry);
    return r.log_id ?? r.id ?? null;
  }

  escalate(authHeader: string, logId: number): Promise<unknown> {
    return this.call(authHeader, "POST", "/assistant/escalate", { log_id: logId });
  }
}
