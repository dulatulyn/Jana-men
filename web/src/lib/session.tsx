"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, isApiError, setToken, type Me } from "@/lib/api";

interface SessionCtx {
  me: Me | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => void;
  version: number;
  invalidate: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const token = getToken();
    const p = token ? api.me() : Promise.reject(null);
    p.then((m) => alive && setMe(m))
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setToken(null);
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    const m = await api.me();
    setMe(m);
    setVersion((v) => v + 1);
    return m;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    setVersion((v) => v + 1);
  }, []);

  const invalidate = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(() => ({ me, ready, login, logout, version, invalidate }), [me, ready, login, logout, version, invalidate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SessionProvider missing");
  return c;
}
