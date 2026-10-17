"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, CircleCheck, CircleX, Loader2, Lock, ListChecks, Trophy, ArrowRight, RotateCcw } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { CourseDetail, QuizResult } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Card, ErrorState, Skeleton } from "@/components/shared/ui";
import { PageHeader } from "@/components/shell/page-header";
import { Btn } from "@/components/shared/button";
import { Markdown } from "@/components/shared/markdown";
import { Segments } from "@/components/academy/segments";
import { CourseCover } from "@/components/academy/cover";

type Step = { kind: "lesson"; index: number } | { kind: "quiz" };

function firstStep(c: CourseDetail): Step {
  const done = new Set(c.enrollment?.completed_lesson_ids ?? []);
  const i = c.lessons.findIndex((l) => !done.has(l.id));
  if (i >= 0 && c.enrollment?.status !== "completed") return { kind: "lesson", index: i };
  if (c.enrollment?.status === "completed") return { kind: "lesson", index: 0 };
  return { kind: "quiz" };
}

function Quiz({ course }: { course: CourseDetail }) {
  const { t } = useI18n();
  const { invalidate } = useSession();
  const [answers, setAnswers] = useState<(number | null)[]>(course.quiz.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const complete = answers.every((a) => a !== null);

  const submit = async () => {
    if (!course.enrollment) return;
    setBusy(true);
    try {
      const r = await api.submitQuiz(course.enrollment.id, answers as number[]);
      setResult(r);
      invalidate();
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (r.passed) toast.success(`${t.academy.passed} · ${r.score}%`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {result && (
        <div className={cn("mb-5 flex items-center gap-4 rounded-[20px] p-5", result.passed ? "bg-jm-green text-white" : "bg-jm-amber-bg text-[#7a4a00]")}>
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", result.passed ? "bg-white/15" : "bg-white")}>
            {result.passed ? <Trophy className="size-7" strokeWidth={1.7} /> : <RotateCcw className="size-6" strokeWidth={1.8} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold tracking-tight">
              {result.passed ? t.academy.passed : t.academy.failed} · <span className="tabular">{result.score}%</span>
            </p>
            <p className={cn("text-[14px]", result.passed ? "text-white/85" : "")}>{result.passed ? t.academy.inProfile : t.academy.failedHint}</p>
          </div>
          {result.passed && (
            <Btn asChild variant="white" size="sm" className="hidden sm:inline-flex">
              <Link href="/profile">{t.nav.profile}</Link>
            </Btn>
          )}
        </div>
      )}
      <p className="text-[13px] font-medium text-jm-muted">{t.academy.quizIntro(course.quiz.length)}</p>
      <ol className="mt-4 space-y-5">
        {course.quiz.map((q, qi) => (
          <li key={q.id}>
            <p className="text-[16px] font-semibold">
              <span className="mr-1.5 text-jm-green tabular">{qi + 1}.</span>
              {q.text}
            </p>
            <div className="mt-2.5 grid gap-2">
              {q.options.map((o, oi) => {
                const chosen = answers[qi] === oi;
                const isCorrect = result && result.correct[qi] === oi;
                const isWrong = result && chosen && result.correct[qi] !== oi;
                return (
                  <button
                    key={oi}
                    disabled={!!result}
                    onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                      !result && (chosen ? "border-jm-green bg-jm-mint/60 font-medium" : "border-jm-line bg-white hover:border-jm-light"),
                      result && isCorrect && "border-jm-green bg-jm-mint/60 font-medium",
                      result && isWrong && "border-jm-red/50 bg-jm-red-bg",
                      result && !isCorrect && !isWrong && "border-jm-line bg-white opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                        chosen || isCorrect ? "border-jm-green bg-jm-green text-white" : "border-[#c9d1cd]",
                        isWrong && "border-jm-red bg-jm-red",
                      )}
                    >
                      {isWrong ? <CircleX className="size-3.5" /> : (chosen || isCorrect) && <Check className="size-3" strokeWidth={3.5} />}
                    </span>
                    <span className="flex-1">{o}</span>
                    {result && isCorrect && <span className="text-[12px] font-semibold text-jm-green">{t.academy.correct}</span>}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        {!result ? (
          <Btn size="lg" className="w-full sm:w-auto" disabled={!complete || busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />}
            {t.academy.submitQuiz}
          </Btn>
        ) : (
          !result.passed && (
            <Btn
              size="lg"
              variant="mint"
              onClick={() => {
                setResult(null);
                setAnswers(course.quiz.map(() => null));
              }}
            >
              <RotateCcw /> {t.academy.retry}
            </Btn>
          )
        )}
      </div>
    </div>
  );
}

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { t } = useI18n();
  const { me, invalidate } = useSession();
  const { data: c, error } = useApi(() => api.course(id), id);
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);

  const back = { href: "/academy", label: t.academy.title };
  if (error)
    return (
      <div className="stack">
        <PageHeader title={t.academy.title} back={back} />
        <ErrorState error={error} />
      </div>
    );
  if (!c || !me)
    return (
      <div className="stack">
        <PageHeader title={t.academy.title} back={back} />
        <Skeleton className="h-[140px] rounded-[20px]" />
        <div className="grid-12">
          <Skeleton className="col-span-12 h-[260px] rounded-[20px] lg:col-span-4 xl:col-span-3" />
          <Skeleton className="col-span-12 h-[420px] rounded-[20px] lg:col-span-8 xl:col-span-9" />
        </div>
      </div>
    );

  const cur = step ?? firstStep(c);
  const e = c.enrollment;
  const done = new Set(e?.completed_lesson_ids ?? []);
  const allLessons = c.lessons.every((l) => done.has(l.id));
  const completed = e?.status === "completed";

  const enroll = async () => {
    setBusy(true);
    try {
      await api.assignCourse({ employee_id: me.employee_id, course_id: c.id, due_date: null });
      invalidate();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const completeLesson = async (index: number) => {
    if (!e) return;
    const lesson = c.lessons[index];
    setBusy(true);
    try {
      if (!done.has(lesson.id)) await api.completeLesson(e.id, lesson.id);
      invalidate();
      setStep(index + 1 < c.lessons.length ? { kind: "lesson", index: index + 1 } : { kind: "quiz" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const lesson = cur.kind === "lesson" ? c.lessons[cur.index] : null;

  return (
    <div className="stack">
      <PageHeader title={c.title} back={back} subtitle={`${t.common.minutes(c.duration_min)} · ${t.academy.lessons(c.lessons.length)} + ${t.academy.quiz.toLowerCase()}`} />
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <CourseCover cover={c.cover} className="hidden aspect-[3/2] h-auto w-[132px] sm:flex" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-jm-ink/80">{c.description}</p>
        </div>
        {e ? (
          <div className="sm:w-[260px]">
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-jm-muted">{t.academy.progress}</span>
              <span className="font-semibold text-jm-green tabular">{e.progress_pct}%</span>
            </div>
            <Segments value={e.progress_pct} count={c.lessons.length + 1} />
          </div>
        ) : (
          <Btn onClick={enroll} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t.academy.enroll}
          </Btn>
        )}
      </Card>

      <div className="grid-12">
        <nav
          aria-label={t.academy.lessonsNav}
          className="scrollbar-none col-span-12 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:sticky lg:top-[calc(var(--header-h)+var(--page-y))] lg:col-span-4 lg:block lg:space-y-1 lg:self-start lg:overflow-visible lg:rounded-[20px] lg:bg-white lg:p-2 xl:col-span-3"
        >
          {c.lessons.map((l, i) => {
            const active = cur.kind === "lesson" && cur.index === i;
            const isDone = done.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => setStep({ kind: "lesson", index: i })}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-full px-3 py-2 text-left text-[14px] transition-colors lg:w-full lg:rounded-2xl lg:py-2.5",
                  active ? "bg-jm-mint font-semibold text-jm-green-strong" : "bg-white text-jm-ink/80 hover:bg-[#f4f6f5] lg:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular",
                    isDone ? "bg-jm-green text-white" : active ? "bg-white text-jm-green ring-2 ring-jm-light" : "bg-[#eef1ef] text-jm-muted",
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="max-w-[180px] truncate lg:max-w-none lg:whitespace-normal">{l.title}</span>
              </button>
            );
          })}
          <button
            onClick={() => (allLessons || completed) && setStep({ kind: "quiz" })}
            disabled={!allLessons && !completed}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-full px-3 py-2 text-left text-[14px] transition-colors disabled:cursor-not-allowed lg:w-full lg:rounded-2xl lg:py-2.5",
              cur.kind === "quiz" ? "bg-jm-mint font-semibold text-jm-green-strong" : "bg-white text-jm-ink/80 hover:bg-[#f4f6f5] lg:bg-transparent",
            )}
          >
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", completed ? "bg-jm-green text-white" : "bg-[#eef1ef] text-jm-muted")}>
              {completed ? <Check className="size-3.5" strokeWidth={3} /> : allLessons ? <ListChecks className="size-3.5" /> : <Lock className="size-3" />}
            </span>
            {t.academy.quiz}
          </button>
        </nav>

        <Card className="col-span-12 p-5 sm:p-8 lg:col-span-8 xl:col-span-9">
          {!e ? (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="max-w-md text-[15px] text-jm-muted">{t.academy.enrollHint}</p>
              <Btn className="mt-5" onClick={enroll} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {t.academy.enroll}
              </Btn>
            </div>
          ) : lesson ? (
            <article>
              <p className="text-[13px] font-semibold tracking-wide text-jm-green uppercase">
                {t.academy.lesson} {cur.kind === "lesson" ? cur.index + 1 : ""} / {c.lessons.length}
              </p>
              <h2 className="mt-1 text-[22px] leading-tight font-bold tracking-tight sm:text-[26px]">{lesson.title}</h2>
              <Markdown source={lesson.content_md} className="mt-2 max-w-[640px]" />
              <div className="mt-7 border-t border-jm-line pt-5">
                {cur.kind === "lesson" && (
                  <Btn size="lg" className="w-full sm:w-auto" onClick={() => completeLesson(cur.index)} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : done.has(lesson.id) ? <ArrowRight /> : <CircleCheck />}
                    {cur.index + 1 < c.lessons.length ? (done.has(lesson.id) ? t.academy.nextLesson : t.academy.markDone) : t.academy.toQuiz}
                  </Btn>
                )}
              </div>
            </article>
          ) : (
            <div>
              <h2 className="mb-1 text-[22px] font-bold tracking-tight sm:text-[26px]">{t.academy.quiz}</h2>
              {!allLessons && !completed ? <p className="text-jm-muted">{t.academy.lockedQuiz}</p> : <Quiz course={c} />}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
