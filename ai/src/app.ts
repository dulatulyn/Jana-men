import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { Assistant, type PreparedAsk } from "./assistant.js";
import { BackendError, UnauthorizedError, type BackendClient } from "./backend/BackendClient.js";
import type { ModelClient } from "./llm.js";
import { DEFAULT_PACING, planDeltas, type PacingOptions } from "./stream.js";
import type { AskResponse } from "./types.js";

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
  modelName?: string | null;
  corsOrigins?: string[];
  now?: () => Date;
  logger?: (msg: string, data?: unknown) => void;
  pacing?: PacingOptions;
}

const err = (code: string, message: string) => ({ error: { code, message } });

export function createApp(deps: AppDeps) {
  const assistant = new Assistant(deps);
  const pacing = deps.pacing ?? DEFAULT_PACING;
  const app = new Hono();

  app.use("*", cors({ origin: deps.corsOrigins ?? ["http://localhost:3000"], allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.get("/health", (c) =>
    c.json({
      ok: true,
      mode: deps.model ? "llm" : "fallback",
      backend: deps.backendMode ?? "mock",
      provider: deps.model?.provider ?? null,
      model: deps.model ? (deps.model.model ?? deps.modelName ?? null) : null,
      llm_available: deps.model ? (deps.model.available?.() ?? true) : false,
    }),
  );

  const bearer = (h: string | undefined) => (h && /^Bearer\s+\S+/i.test(h) ? h : null);

  const readAsk = async (c: { req: { json: () => Promise<unknown> } }) => AskBody.safeParse(await c.req.json().catch(() => null));

  app.post("/ask", async (c) => {
    const auth = bearer(c.req.header("Authorization"));
    if (!auth) return c.json(err("unauthorized", "Missing bearer token"), 401);
    const parsed = await readAsk(c);
    if (!parsed.success) return c.json(err("validation_error", parsed.error.issues.map((i) => i.message).join("; ")), 422);
    try {
      return c.json(await assistant.ask(auth, parsed.data));
    } catch (e) {
      if (e instanceof UnauthorizedError) return c.json(err("unauthorized", "Invalid token"), 401);
      deps.logger?.("ask failed", String(e));
      return c.json(err("backend_unavailable", "HR backend is unavailable, try again later"), 502);
    }
  });

  app.post("/ask/stream", async (c) => {
    const auth = bearer(c.req.header("Authorization"));
    if (!auth) return c.json(err("unauthorized", "Missing bearer token"), 401);
    const parsed = await readAsk(c);
    if (!parsed.success) return c.json(err("validation_error", parsed.error.issues.map((i) => i.message).join("; ")), 422);
    let prepared: PreparedAsk;
    try {
      prepared = await assistant.prepare(auth, parsed.data);
    } catch (e) {
      if (e instanceof UnauthorizedError) return c.json(err("unauthorized", "Invalid token"), 401);
      deps.logger?.("ask/stream failed", String(e));
      return c.json(err("backend_unavailable", "HR backend is unavailable, try again later"), 502);
    }

    const res = streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: "ping", data: "{}" });
      let result: AskResponse;
      try {
        result = await assistant.run(prepared);
      } catch (e) {
        deps.logger?.("ask/stream pipeline failed", String(e));
        await stream.writeSSE({ event: "error", data: JSON.stringify(err("assistant_error", "The assistant could not answer, try again later").error) });
        return;
      }
      if (stream.aborted) return;
      const { answer, ...meta } = result;
      await stream.writeSSE({ event: "meta", data: JSON.stringify(meta) });
      const plan = planDeltas(answer, pacing);
      for (let i = 0; i < plan.chunks.length; i++) {
        if (stream.aborted) return;
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: plan.chunks[i] }) });
        if (plan.delays[i] > 0) await stream.sleep(plan.delays[i]);
      }
      if (!stream.aborted) await stream.writeSSE({ event: "done", data: "{}" });
    });
    res.headers.set("Cache-Control", "no-cache, no-transform");
    res.headers.set("X-Accel-Buffering", "no");
    return res;
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
      if (e instanceof BackendError && e.status >= 400 && e.status < 500) {
        return c.json(e.body ?? err("escalation_failed", "Could not escalate this question"), e.status as ContentfulStatusCode);
      }
      deps.logger?.("escalate failed", String(e));
      return c.json(err("backend_unavailable", "Could not escalate, try again later"), 502);
    }
  });

  return app;
}
