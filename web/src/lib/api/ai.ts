import { getToken } from "./token";
import type { AskResponse, ChatTurn, Locale } from "./types";

export class AiUnavailableError extends Error {}

export async function askAssistant(question: string, locale: Locale, history: ChatTurn[]): Promise<AskResponse> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch("/ai/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, locale, history }),
    });
  } catch {
    throw new AiUnavailableError("network");
  }
  if (!res.ok) throw new AiUnavailableError(String(res.status));
  try {
    const data = (await res.json()) as AskResponse;
    if (!data || typeof data.answer !== "string") throw new Error("shape");
    return {
      status: data.status ?? "answered",
      answer: data.answer,
      sources: Array.isArray(data.sources) ? data.sources : [],
      action: data.action ?? null,
      can_escalate: Boolean(data.can_escalate),
      log_id: data.log_id ?? null,
    };
  } catch {
    throw new AiUnavailableError("bad_response");
  }
}

export async function escalateViaAi(logId: number | null): Promise<boolean> {
  const token = getToken();
  try {
    const res = await fetch("/ai/escalate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ log_id: logId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
