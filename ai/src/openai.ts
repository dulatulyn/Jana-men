import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { ReasoningEffortName } from "./config.js";
import {
  AUTH_COOLDOWN_MS,
  ModelOutputError,
  ModelOutputSchema,
  ModelRefusalError,
  ModelUnavailableError,
  RULES,
  buildMessages,
  describeModelError,
  renderContext,
  renderKb,
  type ModelClient,
  type ModelOutput,
  type ModelRequest,
} from "./llm.js";

export type OpenAIClientLike = Pick<OpenAI, "responses" | "models">;

export interface OpenAIModelOptions {
  apiKey?: string;
  model: string;
  reasoningEffort?: ReasoningEffortName | null;
  timeoutMs?: number;
  maxOutputTokens?: number;
  client?: OpenAIClientLike;
  now?: () => number;
}

export const PROMPT_CACHE_KEY = "janamen-hr-assistant";
export const OUTPUT_FORMAT_NAME = "hr_answer";
const FORMAT = zodTextFormat(ModelOutputSchema, OUTPUT_FORMAT_NAME);

export function buildInstructions(req: Pick<ModelRequest, "kb">): string {
  return `${renderKb(req.kb)}\n\n${RULES}`;
}

export function buildInput(req: ModelRequest): ResponseInputItem[] {
  return [
    { role: "developer", content: renderContext(req) },
    ...buildMessages(req.history, req.question).map((t) => ({ role: t.role, content: t.content })),
  ];
}

function isPersistentFailure(e: unknown): boolean {
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) return true;
  return e instanceof OpenAI.RateLimitError && e.code === "insufficient_quota";
}

export class OpenAIModelClient implements ModelClient {
  readonly provider = "openai" as const;
  readonly model: string;
  private client: OpenAIClientLike;
  private effort: ReasoningEffortName | null;
  private maxOutputTokens: number;
  private now: () => number;
  private disabledUntil = 0;

  constructor(opts: OpenAIModelOptions) {
    this.model = opts.model;
    this.effort = opts.reasoningEffort === undefined ? "low" : opts.reasoningEffort;
    this.maxOutputTokens = opts.maxOutputTokens ?? 4000;
    this.now = opts.now ?? Date.now;
    this.client = opts.client ?? new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 20_000, maxRetries: 1 });
  }

  available(): boolean {
    return this.now() >= this.disabledUntil;
  }

  async generate(req: ModelRequest): Promise<ModelOutput> {
    if (!this.available()) throw new ModelUnavailableError("openai disabled after an auth or quota error");
    try {
      return await this.call(req);
    } catch (e) {
      if (isPersistentFailure(e)) this.disabledUntil = this.now() + AUTH_COOLDOWN_MS;
      throw e;
    }
  }

  async probe(): Promise<string> {
    try {
      await this.client.models.retrieve(this.model, { timeout: 5_000, maxRetries: 0 });
      return "ok";
    } catch (e) {
      if (e instanceof OpenAI.AuthenticationError) this.disabledUntil = this.now() + AUTH_COOLDOWN_MS;
      return describeModelError(e);
    }
  }

  private async call(req: ModelRequest): Promise<ModelOutput> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: buildInstructions(req),
      input: buildInput(req),
      text: { format: FORMAT },
      store: false,
      max_output_tokens: this.maxOutputTokens,
      prompt_cache_key: PROMPT_CACHE_KEY,
      ...(this.effort ? { reasoning: { effort: this.effort } } : {}),
    });
    if (response.status === "incomplete") throw new ModelOutputError(`openai response incomplete (${response.incomplete_details?.reason ?? "unknown"})`);
    if (response.status && response.status !== "completed") throw new ModelOutputError(`openai response ${response.status}`);
    for (const item of response.output) {
      if (item.type === "message" && item.content.some((c) => c.type === "refusal")) throw new ModelRefusalError("openai refusal");
    }
    const parsed = response.output_parsed;
    if (!parsed) throw new ModelOutputError("openai returned no parsable output");
    return ModelOutputSchema.parse(parsed);
  }
}
