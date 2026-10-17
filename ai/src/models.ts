import type { ModelConfig } from "./config.js";
import { AnthropicModelClient, type ModelClient } from "./llm.js";
import { OpenAIModelClient } from "./openai.js";

export function createModelClient(cfg: ModelConfig): ModelClient | null {
  if (!cfg.provider || !cfg.model || !cfg.apiKey) return null;
  if (cfg.provider === "openai") {
    return new OpenAIModelClient({ apiKey: cfg.apiKey, model: cfg.model, reasoningEffort: cfg.reasoningEffort, timeoutMs: cfg.timeoutMs });
  }
  return new AnthropicModelClient(cfg.apiKey, cfg.model, cfg.timeoutMs);
}

export function describeModelSetup(cfg: ModelConfig, client: ModelClient | null): string {
  if (!client) return "mode=fallback (no LLM provider configured)";
  return `mode=llm provider=${cfg.provider} model=${cfg.model}${cfg.reasoningEffort ? ` effort=${cfg.reasoningEffort}` : ""}`;
}
