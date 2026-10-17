import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "kb")) && fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const ROOT = findRoot();

export type Provider = "openai" | "anthropic";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffortName = (typeof REASONING_EFFORTS)[number];

export interface ModelConfig {
  provider: Provider | null;
  model: string | null;
  apiKey?: string;
  reasoningEffort: ReasoningEffortName | null;
  timeoutMs: number;
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => v?.trim() || undefined;

function positiveInt(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
}

function reasoningEffort(v: string | undefined, warnings: string[]): ReasoningEffortName | null {
  if (v === undefined) return "low";
  const e = v.trim().toLowerCase();
  if (!e) return null;
  if ((REASONING_EFFORTS as readonly string[]).includes(e)) return e as ReasoningEffortName;
  warnings.push(`OPENAI_REASONING_EFFORT=${e} is not supported, the parameter is omitted`);
  return null;
}

export function modelConfig(env: Env): ModelConfig {
  const warnings: string[] = [];
  const keys: Record<Provider, string | undefined> = { openai: clean(env.OPENAI_API_KEY), anthropic: clean(env.ANTHROPIC_API_KEY) };
  const requested = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  let provider: Provider | null;
  if (requested === "openai" || requested === "anthropic") {
    provider = keys[requested] ? requested : null;
    if (!provider) warnings.push(`AI_PROVIDER=${requested} but ${requested === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is empty, the assistant runs in fallback mode`);
  } else if (requested === "none" || requested === "fallback") {
    provider = null;
  } else {
    if (requested && requested !== "auto") warnings.push(`AI_PROVIDER=${requested} is unknown, the provider is picked by the available API key`);
    provider = keys.openai ? "openai" : keys.anthropic ? "anthropic" : null;
  }
  if (provider === "openai") {
    return {
      provider,
      model: clean(env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL,
      apiKey: keys.openai,
      reasoningEffort: reasoningEffort(env.OPENAI_REASONING_EFFORT, warnings),
      timeoutMs: positiveInt(env.OPENAI_TIMEOUT_MS, 20_000),
      warnings,
    };
  }
  if (provider === "anthropic") {
    return {
      provider,
      model: clean(env.AI_MODEL) ?? DEFAULT_ANTHROPIC_MODEL,
      apiKey: keys.anthropic,
      reasoningEffort: null,
      timeoutMs: positiveInt(env.ANTHROPIC_TIMEOUT_MS, 30_000),
      warnings,
    };
  }
  return { provider: null, model: null, reasoningEffort: null, timeoutMs: 0, warnings };
}

export const config = {
  port: Number(process.env.PORT ?? 8001),
  backendMode: (process.env.BACKEND_MODE === "real" ? "real" : "mock") as "mock" | "real",
  backendUrl: (process.env.BACKEND_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, ""),
  ai: modelConfig(process.env),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  kbDir: process.env.KB_DIR ?? path.join(ROOT, "kb"),
  profilesFile: process.env.MOCK_PROFILES ?? path.join(ROOT, "mock", "profiles.json"),
};
