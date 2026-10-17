import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Assistant } from "../src/assistant.js";
import { modelConfig } from "../src/config.js";
import { AnthropicModelClient, ModelOutputError, ModelRefusalError, ModelUnavailableError, RULES, type ModelOutput, type ModelRequest } from "../src/llm.js";
import { createModelClient } from "../src/models.js";
import { OpenAIModelClient, OUTPUT_FORMAT_NAME, PROMPT_CACHE_KEY, type OpenAIClientLike } from "../src/openai.js";
import { renderProfile } from "../src/profile.js";
import { backend, NOW, out } from "./helpers.js";

const QUOTE = "Каждому работнику ТОО «Jana Post» предоставляется ежегодный оплачиваемый трудовой отпуск продолжительностью 24 календарных дня.";
const SECRET = "sk-test-DO-NOT-LOG-1234";

type Reply = Record<string, unknown> | Error;

function completed(parsed: ModelOutput | null, extra: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(parsed), parsed }] }],
    output_parsed: parsed,
    ...extra,
  };
}

function fakeSdk(reply: Reply | (() => Reply)) {
  const calls: Array<Record<string, any>> = [];
  const retrieves: string[] = [];
  const client = {
    responses: {
      parse: async (body: Record<string, any>) => {
        calls.push(body);
        const r = typeof reply === "function" ? reply() : reply;
        if (r instanceof Error) throw r;
        return r;
      },
    },
    models: {
      retrieve: async (model: string) => {
        retrieves.push(model);
        const r = typeof reply === "function" ? reply() : reply;
        if (r instanceof Error) throw r;
        return { id: model };
      },
    },
  } as unknown as OpenAIClientLike;
  return { client, calls, retrieves };
}

const authError = () =>
  OpenAI.APIError.generate(401, { error: { message: `Incorrect API key provided: ${SECRET}`, type: "invalid_request_error", code: "invalid_api_key" } }, undefined, new Headers());

async function request(user = "daulet", role: ModelRequest["role"] = "employee"): Promise<ModelRequest> {
  const b = backend();
  const auth = `Bearer mock.${user}`;
  const profile = await b.getProfile(auth);
  return { kb: await b.getKb(auth), profileText: renderProfile(profile), question: "Сколько дней отпуска положено?", locale: "ru", history: [], today: "2026-10-16", role };
}

describe("OpenAIModelClient", () => {
  it("sends KB first, then rules, the user's own profile in input, strict JSON schema, store false", async () => {
    const sdk = fakeSdk(completed(out({ answer: "Положено 24 календарных дня.", citations: [{ slug: "vacation-annual", quote: QUOTE }] })));
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", client: sdk.client });
    const r = await m.generate(await request());
    expect(r.answer).toBe("Положено 24 календарных дня.");
    const body = sdk.calls[0];
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.store).toBe(false);
    expect(body.prompt_cache_key).toBe(PROMPT_CACHE_KEY);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.max_output_tokens).toBeGreaterThanOrEqual(1000);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: OUTPUT_FORMAT_NAME, strict: true });
    expect(body.text.format.schema.required).toEqual(["status", "answer", "citations", "action"]);
    expect(body.instructions.startsWith("KNOWLEDGE BASE.")).toBe(true);
    expect(body.instructions.indexOf("<article slug=\"vacation-annual\"")).toBeLessThan(body.instructions.indexOf(RULES));
    expect(body.instructions.endsWith(RULES)).toBe(true);
    expect(body.instructions).not.toContain("Даулет Ахметов");
    const [dev, ...rest] = body.input;
    expect(dev.role).toBe("developer");
    expect(dev.content).toContain("Даулет Ахметов");
    for (const other of ["Айгерим Садыкова", "Асель Нурланова", "Динара Касымова"]) expect(JSON.stringify(body)).not.toContain(other);
    expect(rest.at(-1)).toEqual({ role: "user", content: "Сколько дней отпуска положено?" });
    expect(dev.content).not.toContain("HR specialist");
  });

  it("keeps the static prefix identical across users", async () => {
    const sdk = fakeSdk(completed(out({ status: "no_answer" })));
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", client: sdk.client });
    await m.generate(await request("daulet"));
    await m.generate(await request("asel"));
    expect(sdk.calls[0].instructions).toBe(sdk.calls[1].instructions);
    expect(sdk.calls[0].input[0].content).not.toBe(sdk.calls[1].input[0].content);
  });

  it("tells the model when the user is HR", async () => {
    const sdk = fakeSdk(completed(out({ status: "no_answer" })));
    await new OpenAIModelClient({ model: "gpt-5.4-mini", client: sdk.client }).generate(await request("dinara", "hr"));
    expect(sdk.calls[0].input[0].content).toContain("HR specialist");
  });

  it("omits reasoning when the effort is empty and passes history", async () => {
    const sdk = fakeSdk(completed(out({ status: "no_answer" })));
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", reasoningEffort: null, client: sdk.client });
    const req = { ...(await request()), history: [{ role: "assistant" as const, content: "Здравствуйте" }, { role: "user" as const, content: "Привет" }, { role: "assistant" as const, content: "Чем помочь?" }] };
    await m.generate(req);
    expect("reasoning" in sdk.calls[0]).toBe(false);
    expect(sdk.calls[0].input.slice(1)).toEqual([
      { role: "user", content: "Привет" },
      { role: "assistant", content: "Чем помочь?" },
      { role: "user", content: "Сколько дней отпуска положено?" },
    ]);
  });

  it("opens the circuit after 401: the next call does not reach the SDK until the cooldown passes", async () => {
    let t = 1_000;
    const sdk = fakeSdk(authError);
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", client: sdk.client, now: () => t });
    await expect(m.generate(await request())).rejects.toBeInstanceOf(OpenAI.AuthenticationError);
    expect(m.available()).toBe(false);
    await expect(m.generate(await request())).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(sdk.calls).toHaveLength(1);
    t += 5 * 60_000 + 1;
    expect(m.available()).toBe(true);
    await expect(m.generate(await request())).rejects.toBeInstanceOf(OpenAI.AuthenticationError);
    expect(sdk.calls).toHaveLength(2);
  });

  it("opens the circuit on insufficient_quota but not on a plain timeout", async () => {
    const quota = OpenAI.APIError.generate(429, { error: { message: "quota", type: "insufficient_quota", code: "insufficient_quota" } }, undefined, new Headers());
    const q = new OpenAIModelClient({ model: "m", client: fakeSdk(quota).client });
    await expect(q.generate(await request())).rejects.toBe(quota);
    expect(q.available()).toBe(false);
    const sdk = fakeSdk(new OpenAI.APIConnectionTimeoutError());
    const tm = new OpenAIModelClient({ model: "m", client: sdk.client });
    await expect(tm.generate(await request())).rejects.toBeInstanceOf(OpenAI.APIConnectionTimeoutError);
    expect(tm.available()).toBe(true);
  });

  it("throws on incomplete responses, refusals and missing parsed output", async () => {
    const incomplete = { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], output_parsed: null };
    await expect(new OpenAIModelClient({ model: "m", client: fakeSdk(incomplete).client }).generate(await request())).rejects.toBeInstanceOf(ModelOutputError);
    const refusal = { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], output_parsed: null };
    await expect(new OpenAIModelClient({ model: "m", client: fakeSdk(refusal).client }).generate(await request())).rejects.toBeInstanceOf(ModelRefusalError);
    await expect(new OpenAIModelClient({ model: "m", client: fakeSdk(completed(null)).client }).generate(await request())).rejects.toBeInstanceOf(ModelOutputError);
    const bad = completed({ status: "maybe" } as unknown as ModelOutput);
    await expect(new OpenAIModelClient({ model: "m", client: fakeSdk(bad).client }).generate(await request())).rejects.toThrow();
  });

  it("probe reports the key status and opens the circuit on 401", async () => {
    const ok = fakeSdk(completed(null));
    expect(await new OpenAIModelClient({ model: "gpt-5.4-mini", client: ok.client }).probe()).toBe("ok");
    expect(ok.retrieves).toEqual(["gpt-5.4-mini"]);
    const bad = new OpenAIModelClient({ model: "gpt-5.4-mini", client: fakeSdk(authError).client });
    const r = await bad.probe();
    expect(r).toBe("AuthenticationError status=401 code=invalid_api_key");
    expect(r).not.toContain(SECRET);
    expect(bad.available()).toBe(false);
  });
});

describe("Assistant with a failing OpenAI provider", () => {
  it.each([
    ["401", authError],
    ["timeout", () => new OpenAI.APIConnectionTimeoutError()],
    ["500", () => OpenAI.APIError.generate(500, { error: { message: "boom" } }, undefined, new Headers())],
    ["network", () => new OpenAI.APIConnectionError({ message: "fetch failed" })],
  ])("%s degrades to the BM25 fallback and never leaks the key into logs", async (_, make) => {
    const logs: string[] = [];
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", client: fakeSdk(make).client });
    const a = new Assistant({ backend: backend(), model: m, now: NOW, logger: (msg, data) => logs.push(`${msg} ${typeof data === "string" ? data : JSON.stringify(data)}`) });
    const r = await a.ask("Bearer mock.aigerim", { question: "Сколько дней отпуска положено?", locale: "ru" });
    expect(r).toMatchObject({ status: "answered", mode: "fallback" });
    expect(r.sources[0].slug).toBe("vacation-annual");
    expect(logs.join("\n")).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain("Incorrect API key");
    expect(logs.some((l) => l.startsWith("model openai failed, using fallback:"))).toBe(true);
  });

  it("POST /ask answers 200 in fallback mode when the key is invalid, /health shows the provider", async () => {
    const m = new OpenAIModelClient({ model: "gpt-5.4-mini", client: fakeSdk(authError).client });
    const app = createApp({ backend: backend(), model: m, now: NOW, backendMode: "mock" });
    const h1 = await (await app.request("/health")).json();
    expect(h1).toEqual({ ok: true, mode: "llm", backend: "mock", provider: "openai", model: "gpt-5.4-mini", llm_available: true });
    const res = await app.request("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mock.aigerim" },
      body: JSON.stringify({ question: "Сколько дней отпуска положено?", locale: "ru" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "answered", mode: "fallback" });
    expect((await (await app.request("/health")).json()).llm_available).toBe(false);
  });
});

describe("provider selection", () => {
  it("defaults to OpenAI when its key is set, then Anthropic, else fallback", () => {
    expect(modelConfig({ OPENAI_API_KEY: "k" })).toMatchObject({ provider: "openai", model: "gpt-5.4-mini", reasoningEffort: "low", timeoutMs: 20_000, warnings: [] });
    expect(modelConfig({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(modelConfig({ OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b" }).provider).toBe("openai");
    expect(modelConfig({})).toMatchObject({ provider: null, model: null, warnings: [] });
  });

  it("honours AI_PROVIDER, OPENAI_MODEL, OPENAI_REASONING_EFFORT and OPENAI_TIMEOUT_MS", () => {
    expect(modelConfig({ AI_PROVIDER: "anthropic", OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b", AI_MODEL: "claude-x" })).toMatchObject({ provider: "anthropic", model: "claude-x" });
    expect(modelConfig({ AI_PROVIDER: "OpenAI", OPENAI_API_KEY: "a", OPENAI_MODEL: "gpt-x", OPENAI_REASONING_EFFORT: "", OPENAI_TIMEOUT_MS: "5000" })).toMatchObject({
      provider: "openai",
      model: "gpt-x",
      reasoningEffort: null,
      timeoutMs: 5000,
    });
    expect(modelConfig({ AI_PROVIDER: "none", OPENAI_API_KEY: "a" }).provider).toBeNull();
  });

  it("warns instead of crashing on a misconfiguration", () => {
    const missing = modelConfig({ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "b" });
    expect(missing.provider).toBeNull();
    expect(missing.warnings[0]).toMatch(/OPENAI_API_KEY is empty/);
    const effort = modelConfig({ OPENAI_API_KEY: "a", OPENAI_REASONING_EFFORT: "turbo" });
    expect(effort).toMatchObject({ provider: "openai", reasoningEffort: null });
    expect(effort.warnings[0]).toMatch(/OPENAI_REASONING_EFFORT/);
    expect(modelConfig({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "b" })).toMatchObject({ provider: "anthropic" });
  });

  it("createModelClient builds the configured client", () => {
    const o = createModelClient(modelConfig({ OPENAI_API_KEY: "a" }));
    expect(o).toBeInstanceOf(OpenAIModelClient);
    expect(o).toMatchObject({ provider: "openai", model: "gpt-5.4-mini" });
    const a = createModelClient(modelConfig({ ANTHROPIC_API_KEY: "b" }));
    expect(a).toBeInstanceOf(AnthropicModelClient);
    expect(a).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(createModelClient(modelConfig({}))).toBeNull();
  });
});
