"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Check } from "lucide-react";
import { isApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { Logo } from "@/components/brand/logo";
import { Avatar, Pill } from "@/components/shared/ui";
import { Btn } from "@/components/shared/button";
import { LangSwitch } from "@/components/shell/lang-switch";
import type { Role } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const DEMO: { login: string; name: string; role: Role; note: { ru: string; kk: string } }[] = [
  { login: "aigerim", name: "Айгерим Садыкова", role: "employee", note: { ru: "Специалист сортировочного центра", kk: "Сұрыптау орталығының маманы" } },
  { login: "erlan", name: "Ерлан Жумабаев", role: "manager", note: { ru: "Начальник смены · команда СЦ", kk: "Ауысым бастығы · СО командасы" } },
  { login: "dinara", name: "Динара Касымова", role: "hr", note: { ru: "HR-менеджер", kk: "HR-менеджер" } },
  { login: "daulet", name: "Даулет Ахметов", role: "employee", note: { ru: "Курьер · команда Ерлана", kk: "Курьер · Ерлан командасы" } },
  { login: "asel", name: "Асель Нурланова", role: "employee", note: { ru: "Бухгалтер · другой отдел", kk: "Бухгалтер · басқа бөлім" } },
];

function JourneyCard() {
  const { t } = useI18n();
  const steps = [t.track.submitted, t.track.manager, t.track.hr, "1С:ЗУП"];
  return (
    <div className="rounded-[22px] bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-white">{t.requestTypeLong.vacation}</span>
        <span className="font-mono text-[12px] text-white/70">JM-00010</span>
      </div>
      <p className="mt-0.5 text-[13px] text-white/70">{t.common.days(11)} · {t.status.manager_approved}</p>
      <div className="mt-4 flex items-center gap-1">
        {steps.map((_, i) => (
          <div key={i} className="relative h-[6px] flex-1 rounded-full bg-white/20">
            <div className={cn("absolute inset-y-0 left-0 rounded-full bg-white", i < 2 ? "w-full" : i === 2 ? "w-1/2" : "w-0")} />
            {i === 2 && (
              <span className="absolute top-1/2 left-1/2 flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
                <Check className="size-3 text-jm-green" strokeWidth={3} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] leading-tight text-white/75">
        {steps.map((s, i) => (
          <span key={i} className={cn(i === 3 && "text-right")}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login, me, ready } = useSession();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && me) router.replace("/dashboard");
  }, [ready, me, router]);

  const doLogin = async (e: string, p: string, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await login(e, p);
      router.replace("/dashboard");
    } catch (err) {
      setError(isApiError(err) && err.status === 401 ? t.login.invalid : isApiError(err) ? err.message : t.errors.network);
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh bg-jm-page lg:grid lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <section className="relative overflow-hidden bg-jm-green px-6 pt-6 pb-10 text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div className="flex items-center justify-between">
          <Logo tone="white" size={36} />
          <LangSwitch className="bg-white/15 lg:hidden [&_button[aria-pressed=false]]:text-white/85 [&_button[aria-pressed=true]]:text-jm-green" />
        </div>
        <div className="mt-8 max-w-md lg:mt-0">
          <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em] lg:text-[46px]">{t.login.tagline}</h1>
          <p className="mt-3 text-[15px] text-white/80 lg:text-[17px]">{t.login.subtitle}</p>
          <div className="mt-8 hidden lg:block">
            <JourneyCard />
          </div>
        </div>
        <p className="hidden text-[13px] text-white/60 lg:block">ТОО «Jana Post» · Terricon Valley Hackathon 2026</p>
        <svg className="pointer-events-none absolute -right-24 -bottom-24 h-[360px] w-[360px] text-white/10" viewBox="0 0 200 200" fill="none" aria-hidden>
          <circle cx="100" cy="100" r="98" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
          <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
        </svg>
      </section>

      <section className="flex items-start justify-center px-4 pb-10 lg:items-center lg:px-10">
        <div className="-mt-5 w-full max-w-[460px] lg:mt-0">
          <div className="mb-4 hidden justify-end lg:flex">
            <LangSwitch className="bg-[#e7ebe9]" />
          </div>
          <div className="rounded-[24px] bg-white p-5 sm:p-7">
            <h2 className="text-[22px] font-bold tracking-tight">{t.login.title}</h2>
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void doLogin(email, password, "form");
              }}
            >
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{t.login.email}</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aigerim@jana.demo"
                  className="h-12 w-full rounded-2xl bg-[#f3f5f4] px-4 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-jm-muted">{t.login.password}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-2xl bg-[#f3f5f4] px-4 text-[15px] outline-none placeholder:text-[#a3aca7] focus:bg-white focus:ring-2 focus:ring-jm-light"
                  required
                />
              </label>
              {error && <p className="rounded-2xl bg-jm-red-bg px-4 py-2.5 text-[14px] text-jm-red">{error}</p>}
              <Btn type="submit" size="lg" className="w-full" disabled={!!busy}>
                {busy === "form" && <Loader2 className="animate-spin" />}
                {t.login.submit}
              </Btn>
            </form>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] bg-white">
            <div className="flex flex-col gap-0.5 px-5 pt-5 pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:px-7">
              <h3 className="text-[16px] font-semibold">{t.login.demoTitle}</h3>
              <span className="text-[12px] text-jm-muted">{t.login.demoHint}</span>
            </div>
            <ul className="divide-y divide-jm-line">
              {DEMO.map((d) => (
                <li key={d.login}>
                  <button
                    onClick={() => doLogin(`${d.login}@jana.demo`, "demo1234", d.login)}
                    disabled={!!busy}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f8faf9] disabled:opacity-60 sm:px-7"
                  >
                    <Avatar name={d.name} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{d.name}</span>
                      <span className="block truncate text-[13px] text-jm-muted">{d.note[locale]}</span>
                    </span>
                    <Pill tone={d.role === "hr" ? "green" : d.role === "manager" ? "outline" : "mint"}>{t.roles[d.role]}</Pill>
                    {busy === d.login ? <Loader2 className="size-5 animate-spin text-jm-green" /> : <ChevronRight className="size-5 text-[#b6bdb9]" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>
    </div>
  );
}
