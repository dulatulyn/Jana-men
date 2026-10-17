import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createBackend } from "./backend/index.js";
import { config } from "./config.js";
import { createModelClient, describeModelSetup } from "./models.js";

for (const w of config.ai.warnings) console.warn(`[ai] warning: ${w}`);
const model = createModelClient(config.ai);
const app = createApp({
  backend: createBackend(),
  model,
  backendMode: config.backendMode,
  modelName: config.ai.model,
  corsOrigins: config.corsOrigins,
  logger: (msg, data) => console.log(`[ai] ${msg}`, data ?? ""),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[ai] JanaMen HR-assistant on http://localhost:${info.port} · backend=${config.backendMode} · ${describeModelSetup(config.ai, model)}`);
  model?.probe?.().then((r) => console.log(`[ai] ${model.provider} key check: ${r === "ok" ? "ok" : `${r}, answers use the fallback until the provider works`}`));
});
