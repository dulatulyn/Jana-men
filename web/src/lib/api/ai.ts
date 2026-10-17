import { api } from "./real";
import { getToken } from "./token";
import type { AskMeta, AskResponse, ChatTurn, Locale } from "./types";

export class AiUnavailableError extends Error {}

class StreamUnsupportedError extends Error {}

export type AskTransport = "stream" | "typed";

export interface StreamHandlers {
  onMeta?: (meta: AskMeta) => void;
  onDelta: (chunk: string) => void;
}

const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function normalize(data: Partial<AskResponse> | null | undefined, answer: string): AskResponse {
  return {
    status: data?.status ?? "answered",
    answer,
    sources: Array.isArray(data?.sources) ? data.sources : [],
    action: data?.action ?? null,
    can_escalate: Boolean(data?.can_escalate),
    log_id: data?.log_id ?? null,
    mode: data?.mode,
  };
}

export const metaOf = (r: AskResponse): AskMeta => ({
  status: r.status,
  sources: r.sources,
  action: r.action,
  can_escalate: r.can_escalate,
  log_id: r.log_id,
  mode: r.mode,
});

export async function askAssistant(question: string, locale: Locale, history: ChatTurn[], signal?: AbortSignal): Promise<AskResponse> {
  let res: Response;
  try {
    res = await fetch("/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
      body: JSON.stringify({ question, locale, history }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new AiUnavailableError("network");
  }
  if (!res.ok) throw new AiUnavailableError(String(res.status));
  let data: Partial<AskResponse> | null = null;
  try {
    data = (await res.json()) as Partial<AskResponse>;
  } catch {
    throw new AiUnavailableError("bad_response");
  }
  if (!data || typeof data.answer !== "string") throw new AiUnavailableError("bad_response");
  return normalize(data, data.answer);
}

interface SseEvent {
  event: string;
  data: string;
}

function parseEvent(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const i = line.indexOf(":");
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (!data.length && event === "message") return null;
  return { event, data: data.join("\n") };
}

function json<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readStream(
  question: string,
  locale: Locale,
  history: ChatTurn[],
  handlers: StreamHandlers,
  signal: AbortSignal | undefined,
  onFirstDelta: () => void,
): Promise<AskResponse> {
  let res: Response;
  try {
    res = await fetch("/ai/ask/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
      body: JSON.stringify({ question, locale, history }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new StreamUnsupportedError("network");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || !type.includes("text/event-stream")) throw new StreamUnsupportedError(String(res.status));

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let meta: Partial<AskResponse> | null = null;
  let answer = "";
  let finished = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let m: RegExpExecArray | null;
      while (!finished && (m = /\r?\n\r?\n/.exec(buffer))) {
        const ev = parseEvent(buffer.slice(0, m.index));
        buffer = buffer.slice(m.index + m[0].length);
        if (!ev) continue;
        if (ev.event === "meta") {
          meta = json<Partial<AskResponse>>(ev.data) ?? {};
          handlers.onMeta?.(metaOf(normalize(meta, "")));
        } else if (ev.event === "delta") {
          const text = json<{ text?: string }>(ev.data)?.text ?? "";
          if (text) {
            if (!answer) onFirstDelta();
            answer += text;
            handlers.onDelta(text);
          }
        } else if (ev.event === "done") {
          finished = true;
        } else if (ev.event === "error") {
          const err = json<{ code?: string; message?: string }>(ev.data);
          throw answer ? new AiUnavailableError(err?.code ?? "stream_error") : new StreamUnsupportedError(err?.code ?? "stream_error");
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!answer) throw new StreamUnsupportedError("empty");
  return normalize(meta, answer);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export async function typeOut(text: string, onDelta: (chunk: string) => void, signal?: AbortSignal) {
  const tokens = text.match(/\s*\S+/g) ?? [text];
  const tail = text.slice(tokens.join("").length);
  const per = Math.max(14, Math.min(42, 2400 / Math.max(1, tokens.length)));
  for (const token of tokens) {
    await sleep(per * (0.6 + Math.random() * 0.8), signal);
    onDelta(token);
  }
  if (tail) onDelta(tail);
}

export async function streamAssistant(
  question: string,
  locale: Locale,
  history: ChatTurn[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<AskResponse & { transport: AskTransport }> {
  let started = false;
  try {
    const res = await readStream(question, locale, history, handlers, signal, () => {
      started = true;
    });
    return { ...res, transport: "stream" };
  } catch (e) {
    if (signal?.aborted || started) throw e;
  }
  const res = await askAssistant(question, locale, history, signal);
  handlers.onMeta?.(metaOf(res));
  await typeOut(res.answer, handlers.onDelta, signal);
  return { ...res, transport: "typed" };
}

export async function escalateQuestion(logId: number): Promise<void> {
  try {
    const res = await fetch("/ai/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ log_id: logId }),
    });
    if (res.ok) return;
  } catch {}
  await api.escalate(logId);
}
