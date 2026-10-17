import { HRIS_ADAPTER, INTEGRATION_OPTIONS, type HrisAdapter, type HrisEmployee, type PostVacationInput } from "../src/integrations/adapters";
import { createTestApi, type TestApi } from "./helpers";

type Entry = { id: number; system: string; operation: string; status: string; request_id: number | null; retryable: boolean; retry_of: number | null };

describe("integration journal and retry (mock adapters)", () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await createTestApi();
  });
  afterAll(() => api.close());
  beforeEach(() => api.reset());

  const failedDoc = async () => {
    const log: Entry[] = (await api.get("dinara", "/integrations/log")).body;
    return log.find((l) => l.request_id === 10 && l.operation === "createDocument")!;
  };

  it("journal entries carry request, idempotency key and a retryable flag", async () => {
    const log = (await api.get("dinara", "/integrations/log")).body;
    expect(await failedDoc()).toMatchObject({ system: "documentolog", status: "error", retryable: true, retry_of: null });
    expect(log.find((l: Entry) => l.request_id === 10 && l.operation === "postVacation")).toMatchObject({
      status: "ok", retryable: false, idempotency_key: "janamen-request-10",
    });
    expect(log.filter((l: Entry) => l.retryable)).toHaveLength(1);
  });

  it("HR retries a failed Documentolog call once; repeats are refused", async () => {
    const failed = await failedDoc();
    const r = await api.post("dinara", `/integrations/log/${failed.id}/retry`);
    expect(r.status).toBe(200);
    expect(r.body.entry).toMatchObject({ status: "ok", operation: "createDocument", request_id: 10, retry_of: failed.id, idempotency_key: "janamen-request-10" });
    expect(r.body.request).toMatchObject({ id: 10, external_1c_id: "ЗУП-ОТ-000398" });
    expect(r.body.request.docflow_id).toMatch(/^DL-\d{4}-05010$/);
    expect((await api.get("daulet", "/requests/10")).body.docflow_id).toBe(r.body.request.docflow_id);
    expect((await api.get("daulet", "/notifications")).body[0]).toMatchObject({ title: "Заявление отправлено на подпись", link: "/requests/10" });

    const again = await api.post("dinara", `/integrations/log/${failed.id}/retry`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_resolved");
    expect((await failedDoc()).retryable).toBe(false);
  });

  it("only failed entries, only HR, unknown ids 404", async () => {
    const ok = ((await api.get("dinara", "/integrations/log")).body as Entry[]).find((l) => l.status === "ok")!;
    const notFailed = await api.post("dinara", `/integrations/log/${ok.id}/retry`);
    expect(notFailed.status).toBe(409);
    expect(notFailed.body.error.code).toBe("not_failed");
    expect((await api.post("erlan", `/integrations/log/${(await failedDoc()).id}/retry`)).status).toBe(403);
    expect((await api.post("dinara", "/integrations/log/999999/retry")).status).toBe(404);
  });
});

describe("timeouts and idempotent retries against a slow 1С", () => {
  let api: TestApi;
  const calls: PostVacationInput[] = [];
  const signals: AbortSignal[] = [];
  const processed = new Map<string, { external_id: string; vacation_balance_days: number }>();
  let syncCalls = 0;

  const slow1C: HrisAdapter = {
    name: "slow-1c",
    fetchEmployees: (opts) => {
      syncCalls++;
      if (opts) signals.push(opts.signal);
      return new Promise<HrisEmployee[]>((resolve) => setTimeout(() => resolve([]), syncCalls === 1 ? 400 : 0));
    },
    postVacation: (input, opts) => {
      calls.push(input);
      if (opts) signals.push(opts.signal);
      const seen = processed.get(input.idempotency_key);
      if (seen) return Promise.resolve(seen);
      const created = { external_id: `ЗУП-ОТ-T${input.request_id}`, vacation_balance_days: 24 - input.days };
      processed.set(input.idempotency_key, created);
      return new Promise((resolve) => setTimeout(() => resolve(created), 400));
    },
    postAdvance: (input) => Promise.resolve({ external_id: `ЗУП-АВ-T${input.request_id}` }),
  };

  beforeAll(async () => {
    api = await createTestApi((b) =>
      b.overrideProvider(HRIS_ADAPTER).useValue(slow1C).overrideProvider(INTEGRATION_OPTIONS).useValue({ timeoutMs: 100, syncTimeoutMs: 100 }),
    );
    await api.reset();
  });
  afterAll(() => api.close());

  it("a timed-out post is journaled, the approval stands, and the retry reuses the same key without a duplicate", async () => {
    await api.post("erlan", "/requests/4/approve", {});
    const approved = await api.post("dinara", "/requests/4/approve", {});
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "approved", external_1c_id: null });
    expect(signals[signals.length - 1].aborted).toBe(true);

    const log: Entry[] = (await api.get("dinara", "/integrations/log")).body;
    const failed = log.find((l) => l.request_id === 4 && l.operation === "postVacation")!;
    expect(failed).toMatchObject({ status: "error", retryable: true, details: "1С:ЗУП: нет ответа за 100 мс" });
    expect((await api.get("daulet", "/profile")).body.vacation_balance_days).toBe(24);

    const retried = await api.post("dinara", `/integrations/log/${failed.id}/retry`);
    expect(retried.status).toBe(200);
    expect(retried.body.request).toMatchObject({ id: 4, external_1c_id: "ЗУП-ОТ-T4" });
    expect(calls.map((c) => c.idempotency_key)).toEqual(["janamen-request-4", "janamen-request-4"]);
    expect(processed.size).toBe(1);
    expect((await api.get("daulet", "/profile")).body.vacation_balance_days).toBe(17);
  });

  it("a timed-out sync is a 502 with a journal entry, and retrying it runs the sync again", async () => {
    const r = await api.post("dinara", "/integrations/1c/sync");
    expect(r.status).toBe(502);
    const failed = ((await api.get("dinara", "/integrations/log")).body as Entry[])[0];
    expect(failed).toMatchObject({ operation: "syncEmployees", status: "error", retryable: true });
    const retried = await api.post("dinara", `/integrations/log/${failed.id}/retry`);
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ entry: { operation: "syncEmployees", status: "ok", retry_of: failed.id }, sync: { synced: 0, changed: 0 } });
    expect((await api.post("dinara", `/integrations/log/${failed.id}/retry`)).body.error.code).toBe("already_resolved");
  });
});
