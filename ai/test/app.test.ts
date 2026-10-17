import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { backend, NOW } from "./helpers.js";

const app = createApp({ backend: backend(), now: NOW });
const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

describe("HTTP API", () => {
  it("GET /health", async () => {
    const r = await app.request("/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, mode: "fallback", backend: "mock" });
  });

  it("401 without / with an invalid token", async () => {
    expect((await post("/ask", { question: "x", locale: "ru" })).status).toBe(401);
    expect((await post("/ask", { question: "x", locale: "ru" }, "mock.nobody")).status).toBe(401);
    expect((await post("/escalate", { log_id: 1 })).status).toBe(401);
  });

  it("422 on bad body", async () => {
    expect((await post("/ask", { question: "" }, "mock.aigerim")).status).toBe(422);
  });

  it("POST /ask returns the contract shape", async () => {
    const r = await post("/ask", { question: "Сколько дней отпуска положено?", locale: "ru", history: [] }, "mock.aigerim");
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(Object.keys(j).sort()).toEqual(["action", "answer", "can_escalate", "log_id", "mode", "sources", "status"]);
    expect(j.status).toBe("answered");
  });

  it("POST /escalate in mock mode", async () => {
    const a = await (await post("/ask", { question: "Есть ли парковка?", locale: "ru" }, "mock.daulet")).json();
    const r = await post("/escalate", { log_id: a.log_id }, "mock.daulet");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("CORS for the frontend", async () => {
    const r = await app.request("/ask", { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" } });
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
