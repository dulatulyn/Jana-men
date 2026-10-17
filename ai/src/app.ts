import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { Assistant } from "./assistant.js";
import { UnauthorizedError, type BackendClient } from "./backend/BackendClient.js";
import type { ModelClient } from "./llm.js";

const AskBody = z.object({
  question: z.string().trim().min(1).max(2000),
  locale: z.enum(["ru", "kk"]).default("ru"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(50)
    .optional(),
});
const EscalateBody = z.object({ log_id: z.number().int().positive() });

export interface AppDeps {
  backend: BackendClient;
  model?: ModelClient | null;
  backendMode?: string;
  modelName?: string;
  corsOrigins?: string[];
  now?: () => Date;
  logger?: (msg: string, data?: unknown) => void;
}

const err = (code: string, message: string) => ({ error: { code, message } });

export function createApp(deps: AppDeps) {
  const assistant = new Assistant(deps);
  const app = new Hono();

  app.use("*", cors({ origin: deps.corsOrigins ?? ["http://localhost:3000"], allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.get("/health", (c) =>
    c.json({ ok: true, mode: deps.model ? "llm" : "fallback", backend: deps.backendMode ?? "mock", model: deps.model ? deps.modelName : null }),
  );

  const bearer = (h: string | undefined) => (h && /^Bearer\s+\S+/i.test(h) ? h : null);

  app.post("/ask", async (c) => {
    const auth = bearer(c.req.header("Authorization"));
    if (!auth) return c.json(err("unauthorized", "Missing bearer token"), 401);
    const parsed = AskBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(err("validation_error", parsed.error.issues.map((i) => i.message).join("; ")), 422);
    try {
      return c.json(await assistant.ask(auth, parsed.data));
    } catch (e) {
      if (e instanceof UnauthorizedError) return c.json(err("unauthorized", "Invalid token"), 401);
      deps.logger?.("ask failed", String(e));
      return c.json(err("backend_unavailable", "HR backend is unavailable, try again later"), 502);
    }
  });

  app.post("/escalate", async (c) => {
    const auth = bearer(c.req.header("Authorization"));
    if (!auth) return c.json(err("unauthorized", "Missing bearer token"), 401);
    const parsed = EscalateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(err("validation_error", "log_id (positive integer) is required"), 422);
    try {
      const r = await deps.backend.escalate(auth, parsed.data.log_id);
      return c.json(r && typeof r === "object" ? { ok: true, ...(r as object) } : { ok: true });
    } catch (e) {
      if (e instanceof UnauthorizedError) return c.json(err("unauthorized", "Invalid token"), 401);
      deps.logger?.("escalate failed", String(e));
      return c.json(err("backend_unavailable", "Could not escalate, try again later"), 502);
    }
  });

  return app;
}
