"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { askAssistant } from "@/lib/api/ai";
import type { AskResponse, ChatTurn } from "@/lib/api/types";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  response?: AskResponse;
  failed?: boolean;
  escalated?: boolean;
  question?: string;
}

interface Ctx {
  messages: ChatMessage[];
  pending: boolean;
  send: (q: string) => Promise<void>;
  reset: () => void;
  markEscalated: (id: number) => void;
}

const AssistantCtx = createContext<Ctx | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const { locale, t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const owner = useRef<number | null>(null);

  useEffect(() => {
    const id = me?.id ?? null;
    if (owner.current !== id) {
      owner.current = id;
      queueMicrotask(() => setMessages([]));
    }
  }, [me?.id]);

  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || pending) return;
      const history: ChatTurn[] = messages
        .filter((m) => !m.failed)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));
      setMessages((ms) => [...ms, { id: ++seq.current, role: "user", text: question }]);
      setPending(true);
      try {
        const res = await askAssistant(question, locale, history);
        setMessages((ms) => [...ms, { id: ++seq.current, role: "assistant", text: res.answer, response: res, question }]);
      } catch {
        setMessages((ms) => [...ms, { id: ++seq.current, role: "assistant", text: t.assistant.unavailable, failed: true, question }]);
      } finally {
        setPending(false);
      }
    },
    [messages, pending, locale, t],
  );

  const reset = useCallback(() => setMessages([]), []);
  const markEscalated = useCallback((id: number) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, escalated: true } : m))), []);

  const value = useMemo(() => ({ messages, pending, send, reset, markEscalated }), [messages, pending, send, reset, markEscalated]);
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

export function useAssistant() {
  const c = useContext(AssistantCtx);
  if (!c) throw new Error("AssistantProvider missing");
  return c;
}
