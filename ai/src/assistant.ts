import { buildAction, detectIntent, parseIso, type BuiltAction, type DetectedIntent } from "./action.js";
import type { BackendClient } from "./backend/BackendClient.js";
import { KbIndex, isStrong } from "./fallback.js";
import { MESSAGES, preFilter, refusalMessage } from "./guard.js";
import type { ModelClient, ModelOutput } from "./llm.js";
import { answerProfile, detectProfileQuestion, renderProfile } from "./profile.js";
import {
  PROFILE_SOURCE,
  type AskResponse,
  type AskStatus,
  type HistoryTurn,
  type KbArticle,
  type Locale,
  type Profile,
  type Source,
} from "./types.js";
import { verifyCitations } from "./verify.js";

export interface AskInput {
  question: string;
  locale: Locale;
  history?: HistoryTurn[];
}

export interface AssistantDeps {
  backend: BackendClient;
  model?: ModelClient | null;
  now?: () => Date;
  logger?: (msg: string, data?: unknown) => void;
}

type Core = Omit<AskResponse, "log_id" | "mode">;

export class Assistant {
  private indexCache: { kb: KbArticle[]; index: KbIndex } | null = null;

  constructor(private deps: AssistantDeps) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  private index(kb: KbArticle[]): KbIndex {
    if (this.indexCache?.kb !== kb) this.indexCache = { kb, index: new KbIndex(kb) };
    return this.indexCache.index;
  }

  async ask(authHeader: string, input: AskInput): Promise<AskResponse> {
    const profile = await this.deps.backend.getProfile(authHeader);
    const kb = await this.deps.backend.getKb(authHeader);
    const question = input.question.trim().slice(0, 2000);
    const locale: Locale = input.locale === "kk" ? "kk" : "ru";

    let mode: AskResponse["mode"] = this.deps.model ? "llm" : "fallback";
    let core: Core;

    const guard = preFilter(question, profile);
    if (guard) {
      core = refused(refusalMessage(guard.reason, locale), guard.reason !== "injection");
    } else if (this.deps.model) {
      try {
        core = await this.llmPath(question, locale, input.history ?? [], profile, kb);
      } catch (err) {
        this.deps.logger?.("LLM path failed, using fallback", String(err));
        mode = "fallback";
        core = this.fallbackPath(question, locale, profile, kb);
      }
    } else {
      core = this.fallbackPath(question, locale, profile, kb);
    }

    let log_id: number | null = null;
    try {
      log_id = await this.deps.backend.log(authHeader, {
        question,
        answer: core.answer,
        status: core.status,
        sources: core.sources,
      });
    } catch (err) {
      this.deps.logger?.("logging failed", String(err));
    }
    return { ...core, log_id, mode };
  }

  private async llmPath(q: string, locale: Locale, history: HistoryTurn[], p: Profile, kb: KbArticle[]): Promise<Core> {
    const profileText = renderProfile(p);
    const out: ModelOutput = await this.deps.model!.generate({
      kb,
      profileText,
      question: q,
      locale,
      history,
      today: this.now().toISOString().slice(0, 10),
    });

    if (out.status === "refused") return refused(out.answer.trim().slice(0, 600) || refusalMessage("model", locale), true);

    const built = this.resolveAction(q, out, p, locale);

    if (out.status === "answered") {
      const v = verifyCitations({
        answer: out.answer,
        citations: out.citations,
        kb,
        profileText,
        question: q,
        extraFacts: built?.facts,
      });
      this.deps.logger?.("verification", { ok: v.ok, rejected: v.rejected, unsupportedNumbers: v.unsupportedNumbers });
      if (v.ok) {
        if (!built) return answered(out.answer.trim(), v.sources);
        return answered(`${out.answer.trim()}\n\n${built.summary}`, mergeSources(v.sources, actionSources(built, kb)), built);
      }
    }
    if (built) return answered(built.summary, actionSources(built, kb), built);
    return noAnswer(locale);
  }

  private resolveAction(q: string, out: ModelOutput, p: Profile, locale: Locale): BuiltAction | null {
    const now = this.now();
    const det = detectIntent(q, now);
    let intent: DetectedIntent | null = null;
    if (det?.type === "vacation" && det.start_date) intent = det;
    else if (out.action?.type === "vacation" && parseIso(out.action.start_date) && parseIso(out.action.end_date))
      intent = { type: "vacation", start_date: out.action.start_date!, end_date: out.action.end_date! };
    else if (det?.type === "advance") intent = { ...det, amount: det.amount ?? out.action?.amount ?? null, reason: det.reason || out.action?.reason || "" };
    else if (out.action?.type === "advance") intent = { type: "advance", amount: out.action.amount, reason: out.action.reason ?? "" };
    if (!intent) return null;
    return buildAction(intent, p.vacation_balance_days, locale, now, (out.action?.comment ?? "").slice(0, 200));
  }

  private fallbackPath(q: string, locale: Locale, p: Profile, kb: KbArticle[]): Core {
    const now = this.now();
    const intent = detectIntent(q, now);
    if (intent) {
      const built = buildAction(intent, p.vacation_balance_days, locale, now);
      if (built) return answered(built.summary, actionSources(built, kb), built);
    }

    const field = detectProfileQuestion(q);
    if (field) return answered(answerProfile(field, p, locale).answer, [PROFILE_SOURCE]);

    const hits = this.index(kb).search(q, 2);
    const best = hits[0];
    if (isStrong(best)) {
      const prefix = locale === "kk" ? "Білім базасынан (орыс тілінде):\n\n" : "";
      let answer = `${prefix}**${best.chunk.title} — ${best.chunk.heading}**\n${best.chunk.text}`;
      const second = hits[1];
      if (second && second.chunk.slug === best.chunk.slug && second.score * second.coverage >= best.score * best.coverage * 0.6)
        answer += `\n\n**${second.chunk.heading}**\n${second.chunk.text}`;
      return answered(answer, [{ slug: best.chunk.slug, title: best.chunk.title }]);
    }
    return noAnswer(locale);
  }
}

function answered(answer: string, sources: Source[], built?: BuiltAction | null): Core {
  return { status: "answered", answer, sources, action: built?.action ?? null, can_escalate: false };
}
function refused(answer: string, canEscalate: boolean): Core {
  return { status: "refused", answer, sources: [], action: null, can_escalate: canEscalate };
}
function noAnswer(locale: Locale): Core {
  return { status: "no_answer" as AskStatus, answer: MESSAGES.no_answer[locale], sources: [], action: null, can_escalate: true };
}

function actionSources(built: BuiltAction, kb: KbArticle[]): Source[] {
  const isVac = built.action.request.type === "vacation";
  const slug = isVac ? "vacation-annual" : "advance-salary";
  const art = kb.find((a) => a.slug === slug);
  const out: Source[] = art ? [{ slug: art.slug, title: art.title }] : [];
  if (isVac) out.push(PROFILE_SOURCE);
  return out;
}

function mergeSources(a: Source[], b: Source[]): Source[] {
  const out = [...a];
  for (const s of b) if (!out.some((x) => x.slug === s.slug)) out.push(s);
  return out;
}
