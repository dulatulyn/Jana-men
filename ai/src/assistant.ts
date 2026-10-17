import { buildAction, detectIntent, parseIso, type BuiltAction, type DetectedIntent } from "./action.js";
import { UnauthorizedError, type BackendClient } from "./backend/BackendClient.js";
import { KbIndex, isStrong } from "./fallback.js";
import { noAnswerMessage, offersHrHandoff, preFilter, refusalMessage } from "./guard.js";
import { describeModelError, type ModelClient, type ModelOutput } from "./llm.js";
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
  type UserRole,
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

export interface PreparedAsk {
  authHeader: string;
  question: string;
  locale: Locale;
  history: HistoryTurn[];
  profile: Profile;
  kb: KbArticle[];
  role: UserRole;
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
    return this.run(await this.prepare(authHeader, input));
  }

  async prepare(authHeader: string, input: AskInput): Promise<PreparedAsk> {
    const [profile, kb, role] = await Promise.all([
      this.deps.backend.getProfile(authHeader),
      this.deps.backend.getKb(authHeader),
      this.role(authHeader),
    ]);
    return {
      authHeader,
      question: input.question.trim().slice(0, 2000),
      locale: input.locale === "kk" ? "kk" : "ru",
      history: input.history ?? [],
      profile,
      kb,
      role,
    };
  }

  async run(p: PreparedAsk): Promise<AskResponse> {
    let mode: AskResponse["mode"] = this.deps.model ? "llm" : "fallback";
    let core: Core;

    const guard = preFilter(p.question, p.profile);
    if (guard) {
      core = refused(refusalMessage(guard.reason, p.locale, p.role), guard.reason !== "injection");
    } else if (this.deps.model) {
      try {
        core = await this.llmPath(p);
      } catch (err) {
        this.deps.logger?.(`model ${this.deps.model.provider ?? "llm"} failed, using fallback:`, describeModelError(err));
        mode = "fallback";
        core = this.fallbackPath(p);
      }
    } else {
      core = this.fallbackPath(p);
    }
    if (p.role === "hr") core = { ...core, can_escalate: false };

    let log_id: number | null = null;
    try {
      log_id = await this.deps.backend.log(p.authHeader, {
        question: p.question,
        answer: core.answer,
        status: core.status,
        sources: core.sources,
      });
    } catch (err) {
      this.deps.logger?.("logging failed", String(err));
    }
    return { ...core, log_id, mode };
  }

  private async role(authHeader: string): Promise<UserRole> {
    try {
      return (await this.deps.backend.getMe(authHeader)).role;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      this.deps.logger?.("role lookup failed, assuming employee", String(err));
      return "employee";
    }
  }

  private async llmPath(p: PreparedAsk): Promise<Core> {
    const { question: q, locale, profile, kb, role } = p;
    const profileText = renderProfile(profile);
    const out: ModelOutput = await this.deps.model!.generate({
      kb,
      profileText,
      question: q,
      locale,
      history: p.history,
      today: this.now().toISOString().slice(0, 10),
      role,
    });

    if (out.status === "refused") {
      const text = out.answer.trim().slice(0, 600);
      const safe = text && !(role === "hr" && offersHrHandoff(text)) ? text : refusalMessage("model", locale, role);
      return refused(safe, true);
    }

    const built = this.resolveAction(q, out, profile, locale);

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
    return noAnswer(locale, role);
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

  private fallbackPath(p: PreparedAsk): Core {
    const { question: q, locale, profile, kb, role } = p;
    const now = this.now();
    const intent = detectIntent(q, now);
    if (intent) {
      const built = buildAction(intent, profile.vacation_balance_days, locale, now);
      if (built) return answered(built.summary, actionSources(built, kb), built);
    }

    const field = detectProfileQuestion(q);
    if (field) return answered(answerProfile(field, profile, locale).answer, [PROFILE_SOURCE]);

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
    return noAnswer(locale, role);
  }
}

function answered(answer: string, sources: Source[], built?: BuiltAction | null): Core {
  return { status: "answered", answer, sources, action: built?.action ?? null, can_escalate: false };
}
function refused(answer: string, canEscalate: boolean): Core {
  return { status: "refused", answer, sources: [], action: null, can_escalate: canEscalate };
}
function noAnswer(locale: Locale, role: UserRole): Core {
  return { status: "no_answer" as AskStatus, answer: noAnswerMessage(locale, role), sources: [], action: null, can_escalate: role !== "hr" };
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
