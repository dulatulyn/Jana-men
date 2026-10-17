"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { metaOf, streamAssistant } from "@/lib/api/ai";
import type { AskMeta, ChatTurn } from "@/lib/api/types";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";

export type Phase = "thinking" | "streaming" | "done" | "failed";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  phase?: Phase;
  meta?: AskMeta;
  interrupted?: boolean;
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = me?.id ?? null;
    if (owner.current !== id) {
      owner.current = id;
      abortRef.current?.abort();
      abortRef.current = null;
      queueMicrotask(() => {
        setMessages([]);
        setPending(false);
      });
    }
  }, [me?.id]);

  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || pending) return;
      const history: ChatTurn[] = messages
        .filter((m) => m.phase !== "failed" && m.text)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));
      const uid = ++seq.current;
      const aid = ++seq.current;
      setMessages((ms) => [...ms, { id: uid, role: "user", text: question }, { id: aid, role: "assistant", text: "", phase: "thinking", question }]);
      setPending(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn: (m: ChatMessage) => ChatMessage) => setMessages((ms) => ms.map((m) => (m.id === aid ? fn(m) : m)));
      try {
        const res = await streamAssistant(
          question,
          locale,
          history,
          {
            onMeta: (meta) => patch((m) => ({ ...m, meta })),
            onDelta: (chunk) => patch((m) => ({ ...m, text: m.text + chunk, phase: "streaming" })),
          },
          ctrl.signal,
        );
        patch((m) => ({ ...m, text: res.answer || m.text, phase: "done", meta: metaOf(res) }));
      } catch {
        if (ctrl.signal.aborted) return;
        patch((m) => (m.text ? { ...m, phase: "done", interrupted: true } : { ...m, phase: "failed", text: t.assistant.unavailable }));
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setPending(false);
        }
      }
    },
    [messages, pending, locale, t],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setMessages([]);
  }, []);

  const markEscalated = useCallback((id: number) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, escalated: true } : m))), []);

  const value = useMemo(() => ({ messages, pending, send, reset, markEscalated }), [messages, pending, send, reset, markEscalated]);
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

export function useAssistant() {
  const c = useContext(AssistantCtx);
  if (!c) throw new Error("AssistantProvider missing");
  return c;
}
