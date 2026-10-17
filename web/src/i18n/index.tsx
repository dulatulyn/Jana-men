"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { kk } from "./kk";
import { ru, type Dict } from "./ru";
import type { Locale } from "@/lib/api/types";

const dicts: Record<Locale, Dict> = { ru, kk };
const KEY = "janamen.locale";

interface I18nCtx {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nCtx>({ locale: "ru", t: ru, setLocale: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
    }
    if (saved === "kk" || saved === "ru") {
      const l = saved;
      queueMicrotask(() => setLocaleState(l));
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "kk" ? "kk" : "ru";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
    }
  }, []);

  const value = useMemo(() => ({ locale, t: dicts[locale], setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
