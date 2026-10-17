import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createBackend } from "./backend/index.js";
import { config } from "./config.js";
import { AnthropicModelClient } from "./llm.js";

const model = config.anthropicApiKey ? new AnthropicModelClient(config.anthropicApiKey, config.model) : null;
const app = createApp({
  backend: createBackend(),
  model,
  backendMode: config.backendMode,
  modelName: config.model,
  corsOrigins: config.corsOrigins,
  logger: (msg, data) => console.log(`[ai] ${msg}`, data ?? ""),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `[ai] JanaMen HR-assistant on http://localhost:${info.port} · backend=${config.backendMode} · mode=${model ? `llm (${config.model})` : "fallback (no ANTHROPIC_API_KEY)"}`,
  );
});
