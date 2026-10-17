import fs from "node:fs";
import type { KbArticle, Profile } from "../types.js";
import { loadKbDir } from "../kb.js";
import { UnauthorizedError, type BackendClient, type LogEntry } from "./BackendClient.js";

export class MockBackend implements BackendClient {
  private profiles: Record<string, Profile>;
  private kb: KbArticle[];
  readonly logs: Array<LogEntry & { id: number; login: string; escalated: boolean; created_at: string }> = [];
  private nextId = 1;

  constructor(opts: { kbDir: string; profilesFile: string }) {
    this.kb = loadKbDir(opts.kbDir);
    this.profiles = JSON.parse(fs.readFileSync(opts.profilesFile, "utf8"));
  }

  private login(authHeader: string): string {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let login: string | undefined;
    const m = /^mock\.([a-z0-9_.-]+?)(@jana\.demo)?$/i.exec(token);
    if (m) login = m[1].toLowerCase();
    else if (token.split(".").length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        const id = String(payload.email ?? payload.login ?? payload.sub ?? "");
        login = id.split("@")[0].toLowerCase();
      } catch {
      }
    }
    if (!login || !this.profiles[login]) throw new UnauthorizedError("unknown mock token");
    return login;
  }

  async getProfile(authHeader: string): Promise<Profile> {
    return structuredClone(this.profiles[this.login(authHeader)]);
  }

  async getKb(authHeader: string): Promise<KbArticle[]> {
    this.login(authHeader);
    return this.kb;
  }

  async log(authHeader: string, entry: LogEntry): Promise<number | null> {
    const id = this.nextId++;
    this.logs.push({ ...entry, id, login: this.login(authHeader), escalated: false, created_at: new Date().toISOString() });
    return id;
  }

  async escalate(authHeader: string, logId: number): Promise<unknown> {
    const login = this.login(authHeader);
    const entry = this.logs.find((l) => l.id === logId && l.login === login);
    if (entry) entry.escalated = true;
    return { ok: true };
  }
}
