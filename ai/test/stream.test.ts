import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { BackendClient } from "../src/backend/BackendClient.js";
import { DEFAULT_PACING, planDeltas, splitWords } from "../src/stream.js";
import type { KbArticle } from "../src/types.js";
import { backend, NOW } from "./helpers.js";

const FAST = { minDelayMs: 0, maxDelayMs: 0, maxTotalMs: 0 };

function parseSse(text: string) {
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      return { event, data: JSON.parse(data.join("\n")) };
    });
}

const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /ask/stream", () => {
  const app = createApp({ backend: backend(), now: NOW, pacing: FAST });

  it.each([
    ["aigerim", "Сколько дней отпуска положено?"],
    ["aigerim", "Хочу в отпуск с 10 по 20 ноября"],
    ["daulet", "Как получить льготную ипотеку через компанию?"],
    ["dinara", "Какая зарплата у Ерлана?"],
  ])("%s: ping → meta → delta… → done, deltas add up to the /ask answer (%s)", async (user, question) => {
    const res = await post(app, "/ask/stream", { question, locale: "ru" }, `mock.${user}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const events = parseSse(await res.text());
    expect(events[0]).toEqual({ event: "ping", data: {} });
    expect(events[1].event).toBe("meta");
    expect(events.at(-1)).toEqual({ event: "done", data: {} });
    const deltas = events.slice(2, -1);
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((e) => e.event === "delta" && Object.keys(e.data).join() === "text")).toBe(true);

    const meta = events[1].data;
    expect(Object.keys(meta).sort()).toEqual(["action", "can_escalate", "log_id", "mode", "sources", "status"]);
    const plain = await (await post(app, "/ask", { question, locale: "ru" }, `mock.${user}`)).json();
    expect(deltas.map((e) => e.data.text).join("")).toBe(plain.answer);
    const { answer, log_id, ...rest } = plain;
    expect(typeof meta.log_id).toBe("number");
    expect({ ...meta, log_id: undefined }).toEqual({ ...rest, log_id: undefined });
  });

  it("401 and 422 are plain JSON responses before any stream starts", async () => {
    for (const token of [undefined, "mock.nobody"]) {
      const r = await post(app, "/ask/stream", { question: "Сколько дней отпуска положено?", locale: "ru" }, token);
      expect(r.status).toBe(401);
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      expect((await r.json()).error.code).toBe("unauthorized");
    }
    const bad = await post(app, "/ask/stream", { question: "" }, "mock.aigerim");
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe("validation_error");
  });

  it("502 JSON when the backend is down before the stream starts", async () => {
    const down: BackendClient = {
      ...backend(),
      getProfile: async () => {
        throw new Error("ECONNREFUSED");
      },
      getKb: async () => [],
      getMe: async () => ({ role: "employee" }),
      log: async () => null,
      escalate: async () => ({}),
    };
    const r = await post(createApp({ backend: down, now: NOW, pacing: FAST }), "/ask/stream", { question: "Привет" }, "mock.aigerim");
    expect(r.status).toBe(502);
    expect((await r.json()).error.code).toBe("backend_unavailable");
  });

  it("emits an error event when the pipeline fails after the stream started", async () => {
    const b = backend();
    const broken = [{ slug: "x", title: "X", category: "c", body_md: null }] as unknown as KbArticle[];
    const failing: BackendClient = {
      getProfile: (a) => b.getProfile(a),
      getKb: async () => broken,
      getMe: (a) => b.getMe(a),
      log: (a, e) => b.log(a, e),
      escalate: (a, id) => b.escalate(a, id),
    };
    const r = await post(createApp({ backend: failing, now: NOW, pacing: FAST, logger: () => {} }), "/ask/stream", { question: "Как оформить командировку?" }, "mock.aigerim");
    expect(r.status).toBe(200);
    const events = parseSse(await r.text());
    expect(events.map((e) => e.event)).toEqual(["ping", "error"]);
    expect(events[1].data).toEqual({ code: "assistant_error", message: expect.any(String) });
  });

  it("paces deltas in real time with the default pacing", async () => {
    const slow = createApp({ backend: backend(), now: NOW, pacing: { minDelayMs: 20, maxDelayMs: 20, maxTotalMs: 2500 } });
    const t0 = Date.now();
    const res = await post(slow, "/ask/stream", { question: "Как получить льготную ипотеку через компанию?" }, "mock.aigerim");
    const events = parseSse(await res.text());
    const deltas = events.filter((e) => e.event === "delta").length;
    expect(Date.now() - t0).toBeGreaterThanOrEqual((deltas - 1) * 20 - 5);
  });
});

describe("planDeltas", () => {
  const long = Array.from({ length: 400 }, (_, i) => `слово${i}${i % 9 === 0 ? ",\n\n" : " "}`).join("") + "конец.";

  it("splits into word chunks whose concatenation is exactly the answer", () => {
    for (const text of ["", "Одно", "  ведущие пробелы и\nперенос\n\n- пункт  ", "**Заголовок — раздел**\nТекст 24 дня.\n\nЕщё абзац.", long]) {
      expect(planDeltas(text).chunks.join("")).toBe(text);
      expect(splitWords(text).join("")).toBe(text);
    }
    expect(planDeltas("раз два три").chunks).toEqual(["раз ", "два ", "три"]);
  });

  it("paces 20–35 ms per chunk and caps the total at 2.5 s", () => {
    for (const text of ["Положено 24 календарных дня.", long]) {
      const { chunks, delays } = planDeltas(text, DEFAULT_PACING);
      expect(delays).toHaveLength(chunks.length);
      expect(delays.at(-1)).toBe(0);
      for (const d of delays.slice(0, -1)) {
        expect(d).toBeGreaterThanOrEqual(20);
        expect(d).toBeLessThanOrEqual(35);
      }
      expect(delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2500);
    }
    const capped = planDeltas(long, { ...DEFAULT_PACING, random: () => 1 });
    expect(capped.chunks.length).toBeLessThan(splitWords(long).length);
    expect(capped.delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2500);
  });
});
