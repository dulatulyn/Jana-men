import { afterEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../src/backend/BackendClient.js";
import { RealBackend } from "../src/backend/RealBackend.js";

afterEach(() => vi.unstubAllGlobals());

describe("RealBackend", () => {
  it("forwards the user's Authorization header and maps 401", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith("/profile")) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ log_id: 7 }), { status: 200 });
    });
    const b = new RealBackend("http://api/api/v1");
    await expect(b.getProfile("Bearer jwt")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await b.log("Bearer jwt", { question: "q", answer: "a", status: "answered", sources: [] })).toBe(7);
    expect(calls[0][0]).toBe("http://api/api/v1/profile");
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ question: "q", answer: "a", status: "answered", sources: [] });
  });

  it("caches GET /kb", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return new Response(JSON.stringify([{ slug: "a", title: "A", category: "c", body_md: "x" }]));
    });
    const b = new RealBackend("http://api");
    await b.getKb("Bearer t");
    await b.getKb("Bearer t");
    expect(n).toBe(1);
  });
});
