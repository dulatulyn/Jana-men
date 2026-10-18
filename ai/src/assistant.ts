import {
  buildAction,
  detectIntent,
  extractAmount,
  extractDateRange,
  fmt,
  impossibleDate,
  localToday,
  mentionsVacation,
  notOwnRequest,
  parseIso,
  type BuiltAction,
  type DetectedIntent,
} from "./action.js";
import { UnauthorizedError, type BackendClient } from "./backend/BackendClient.js";
import { config } from "./config.js";
import { KbIndex, isStrong } from "./fallback.js";
import {
  badDateMessage,
  detectSmallTalk,
  noAnswerMessage,
  preFilter,
  refusalMessage,
  smallTalkMessage,
  withoutHrHandoff,
  type RefusalReason,
} from "./guard.js";
import { kkTitles } from "./kb.js";
import { describeModelError, type ModelClient, type ModelOutput } from "./llm.js";
import { answerProfile, detectProfileQuestion, renderProfile } from "./profile.js";
import { keepSentences, normalizeForMatch, stripInvisible, U } from "./text.js";
import {
  PROFILE_SOURCE,
  PROFILE_SOURCE_KK,
  type AskResponse,
  type AskStatus,
  type HistoryTurn,
  type KbArticle,
  type Locale,
  type Profile,
  type Source,
  type UserRole,
} from "./types.js";
import { verifyCitations, type VerifiedCitation, type VerifyResult } from "./verify.js";

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

const PARTIAL =
  /(не\s+указ(ан|ыва)|нет\s+(надёжной\s+|надежной\s+)?информаци|не\s+прописан|не\s+описыва|не\s+описан|не\s+содерж|не\s+сказано|уточнит\S*\s+у\s+(hr|руководител)|көрсетілмеген|ақпарат\s+жоқ|сипатталмаған|айтылмаған)/i;

const BARE_YES_NO = /^(да|нет|иә|жоқ|yes|no)(?!\p{L})/iu;

const GROUPS = [
  { type: "office", heading: /^офис/i, mention: /(офис|кеңсе)/i, name: { ru: "«Офис»", kk: "«Кеңсе»" }, label: { ru: "офис", kk: "кеңсе" } },
  {
    type: "warehouse",
    heading: /(сортировоч|склад)/i,
    mention: /(сортировоч|склад|сұрыптау|қойма)/i,
    name: { ru: "«Сортировочный центр (склад)»", kk: "«Сұрыптау орталығы (қойма)»" },
    label: { ru: "склад / сортировочный центр", kk: "қойма / сұрыптау орталығы" },
  },
  { type: "courier", heading: /^курьер/i, mention: /курьер/i, name: { ru: "«Курьеры»", kk: "«Курьерлер»" }, label: { ru: "курьер", kk: "курьер" } },
] as const;

const DRAFT_TALK = U(
  /(черновик|\bжоба|подготов(ил|ила|лю|им)\b|оформ(лю|ляю|им)\b|заполн(ю|ил|ила)\b|могу\s+(подготовить|оформить|заполнить|помочь)|өтінім\S*\s+(\S+\s+){0,2}дайын|дайында(дым|ймын|п\s+бер))/i,
);

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
      question: stripInvisible(input.question).trim().slice(0, 2000),
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

    const talk = detectSmallTalk(p.question);
    const guard = talk ? null : preFilter(p.question, p.profile);
    const badDate = talk || guard || !mentionsVacation(p.question) ? null : impossibleDate(p.question);
    if (talk) {
      core = answered(smallTalkMessage(talk, p.locale), []);
    } else if (guard) {
      core = refused(refusalMessage(guard.reason, p.locale, p.role), guard.reason !== "injection");
    } else if (badDate) {
      core = answered(badDateMessage(badDate, p.locale), []);
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
    if (p.role === "hr") core = forHr(core, p.locale);
    core = { ...core, sources: localizeSources(core.sources, p.kb, p.locale) };

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
      history: safeHistory(p.history, profile),
      today: localToday(this.now()),
      role,
    });

    if (out.status === "refused") {
      const reason = refusalReason(out.refusal_reason);
      return refused(refusalMessage(reason, locale, role), reason !== "injection");
    }
    if (out.status !== "answered") return noAnswer(locale, role);

    const built = this.resolveAction(q, out, profile, locale);
    const v = verifyCitations({ answer: out.answer, citations: out.citations, kb, profileText, extraFacts: built?.facts });
    this.deps.logger?.("verification", { ok: v.ok, rejected: v.rejected, unsupportedNumbers: v.unsupportedNumbers });
    const partial = out.partial || PARTIAL.test(out.answer);
    if (v.ok) {
      const text = tidyAnswer(out.answer, locale);
      if (built) {
        const extra = withoutDraftEcho(text, built);
        return answered(extra ? `${extra}\n\n${built.summary}` : built.summary, mergeSources(v.sources, actionSources(built, kb)), built, partial);
      }
      if (text && BARE_YES_NO.test(text) && text.split(/\s+/).length <= 3) return sectionsAnswer(v, kb, locale);
      if (text) return scopedAnswer(v, q, text, profile.work_type, locale) ?? answered(text, v.sources, null, partial);
    }
    if (built) return answered(built.summary, actionSources(built, kb), built);
    if (v.verified.length) return scopedAnswer(v, q, "", profile.work_type, locale) ?? quotesAnswer(v, locale);
    return noAnswer(locale, role);
  }

  private resolveAction(q: string, out: ModelOutput, p: Profile, locale: Locale): BuiltAction | null {
    const a = out.action;
    if (!a || notOwnRequest(q)) return null;
    const now = this.now();
    let intent: DetectedIntent | null = null;
    if (a.type === "vacation") {
      const r = extractDateRange(q, now);
      if (r) intent = { type: "vacation", start_date: r.start, end_date: r.end };
      else if (parseIso(a.start_date) && parseIso(a.end_date)) intent = { type: "vacation", start_date: a.start_date!, end_date: a.end_date! };
    } else {
      intent = { type: "advance", amount: a.amount ?? extractAmount(q), reason: (a.reason ?? "").trim().replace(/^(на|для)\s+/i, "") };
    }
    if (!intent) return null;
    return buildAction(intent, p.vacation_balance_days, locale, now, (a.comment ?? "").slice(0, 200));
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

function answered(answer: string, sources: Source[], built?: BuiltAction | null, canEscalate = false): Core {
  return { status: "answered", answer, sources, action: built?.action ?? null, can_escalate: canEscalate };
}
function refused(answer: string, canEscalate: boolean): Core {
  return { status: "refused", answer, sources: [], action: null, can_escalate: canEscalate };
}
function noAnswer(locale: Locale, role: UserRole): Core {
  return { status: "no_answer" as AskStatus, answer: noAnswerMessage(locale, role), sources: [], action: null, can_escalate: role !== "hr" };
}

function refusalReason(r: ModelOutput["refusal_reason"]): RefusalReason | "model" {
  return r === "other_person" || r === "hr_decision" || r === "injection" ? r : "model";
}

function safeHistory(history: HistoryTurn[], self: Profile): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  let dropReply = false;
  for (const t of history) {
    if (t.role === "user") {
      dropReply = typeof t.content === "string" && preFilter(t.content, self) !== null;
      if (!dropReply) out.push(t);
    } else if (dropReply) {
      dropReply = false;
    } else {
      out.push(t);
    }
  }
  return out;
}

function tidyAnswer(text: string, locale: Locale): string {
  const t = text.trim();
  if (locale === "kk")
    return t
      .replace(/(?<!\p{L})KB(-?(да|де|та|те))?(?!\p{L})/gu, (_, suffix) => (suffix ? "білім базасында" : "білім базасы"))
      .replace(/(?<!\p{L})([Бб])аза\s+білім(інде|іне|інен|нің|ін|і)?(?!\p{L})/gu, (_, b, end) => `${b === "Б" ? "Б" : "б"}ілім базасы${KK_CASE[end ?? "і"] ?? ""}`)
      .replace(/(?<!\p{L})([Бб])ольничн(ый|ого|ому|ым|ом|ая|ое|ые|ых)?-?(\p{L}*)/gu, (_, b, _ru, end) => `${b === "Б" ? "А" : "а"}уру парағы${KK_SICK[KK_SUFFIX.find(([re]) => re.test(end))?.[1] ?? ""] ?? ""}`)
      .replace(/«Заявки»/g, "«Өтінімдер»")
      .replace(/«Мои заявки»/g, "«Менің өтінімдерім»");
  return t
    .replace(/(?<!\p{L})([Вв]|[Пп]о)\s+KB(?!\p{L})/gu, "$1 базе знаний")
    .replace(/(?<!\p{L})([Ии]з)\s+KB(?!\p{L})/gu, "$1 базы знаний")
    .replace(/(?<!\p{L})KB(?!\p{L})/gu, "база знаний");
}

const KK_CASE: Record<string, string> = { інде: "нда", іне: "на", інен: "нан", нің: "ның", ін: "н", і: "" };
const KK_SUFFIX: Array<[RegExp, string]> = [
  [/^(дың|дің|ның|нің|тың|тің)$/, "gen"],
  [/^(дан|ден|нан|нен|тан|тен)$/, "abl"],
  [/^(ды|ді|ны|ні|ты|ті)$/, "acc"],
  [/^(ға|ге|қа|ке)$/, "dat"],
  [/^(да|де|та|те)$/, "loc"],
];
const KK_SICK: Record<string, string> = { gen: "ның", abl: "нан", acc: "н", dat: "на", loc: "нда" };

function withoutDraftEcho(text: string, built: BuiltAction): string {
  const req = built.action.request;
  const marks: string[] = [];
  const pairs: RegExp[] = [];
  if (req.type === "vacation") {
    const { start_date: s, end_date: e } = req.payload;
    marks.push(s, e, fmt(s), fmt(e), fmt(s).slice(0, 5), fmt(e).slice(0, 5));
    pairs.push(new RegExp(`(?<!\\d)${Number(s.slice(8, 10))}(?!\\d)[^.!?\\d]{1,25}(?<!\\d)${Number(e.slice(8, 10))}(?!\\d)`));
  } else if (req.payload.amount) {
    marks.push(String(req.payload.amount));
  }
  const covered = [/50\s*%/, /14\s+(календарн|күнтізбелік)/].filter((re) => re.test(built.summary));
  return keepSentences(text, (sentence) => {
    const n = normalizeForMatch(sentence);
    if (DRAFT_TALK.test(sentence) || marks.some((m) => n.includes(m)) || pairs.some((re) => re.test(n))) return false;
    if (covered.some((re) => re.test(sentence))) return false;
    return !(req.type === "vacation" && /(остат|қалдық|қалдығ)/i.test(sentence));
  });
}

function quoteLines(c: VerifiedCitation, locale: Locale): string[] {
  const lines = c.quote
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((l) => l && !l.startsWith("#"));
  if (c.slug !== PROFILE_SOURCE.slug) return lines.map((l) => `- ${l}`);
  return lines.map((l) => `- ${locale === "kk" ? "Сіздің профиліңіз" : "Ваш профиль"}: ${l}`);
}

function bullets(citations: VerifiedCitation[], locale: Locale): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of citations)
    for (const line of quoteLines(c, locale)) {
      const key = normalizeForMatch(line);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  return out.join("\n");
}

function quotesAnswer(v: VerifyResult, locale: Locale): Core {
  const lead = locale === "kk" ? "Білім базасынан (орыс тілінде):" : "Вот что сказано в базе знаний:";
  return { status: "answered", answer: `${lead}\n\n${bullets(v.verified, locale)}`, sources: v.sources, action: null, can_escalate: true };
}

function sectionsAnswer(v: VerifyResult, kb: KbArticle[], locale: Locale): Core {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const c of v.verified) {
    const title = kb.find((a) => a.slug === c.slug)?.title;
    if (!c.section || !title) {
      parts.push(bullets([c], locale));
      continue;
    }
    const key = `${c.slug}#${c.heading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`**${c.heading && c.heading !== title ? `${title} — ${c.heading}` : title}**\n${c.section}`);
  }
  const lead = locale === "kk" ? "Білім базасынан (орыс тілінде):" : "Вот что сказано в базе знаний:";
  return { status: "answered", answer: `${lead}\n\n${parts.join("\n\n")}`, sources: v.sources, action: null, can_escalate: false };
}

function groupOf(heading: string | undefined) {
  return heading ? GROUPS.find((g) => g.heading.test(heading)) : undefined;
}

function scopedAnswer(v: VerifyResult, q: string, answer: string, workType: string | undefined, locale: Locale): Core | null {
  const own = GROUPS.find((g) => g.type === workType);
  if (!own) return null;
  const foreignOf = (c: VerifiedCitation) => {
    const g = groupOf(c.heading);
    return g && g !== own && !g.mention.test(q) && !g.mention.test(answer) ? g : undefined;
  };
  const foreign = v.verified.filter((c) => foreignOf(c));
  if (!foreign.length) return null;
  const names = [...new Set(foreign.map((c) => foreignOf(c)!.name[locale]))].join(", ");
  const rest = v.verified.filter((c) => !foreignOf(c));
  const lead =
    locale === "kk"
      ? `Білім базасында бұл ереже тек ${names} бөлімі үшін бар; сіздің жұмыс түріңіз («${own.label.kk}») үшін ол көрсетілмеген (дәйексөз орыс тілінде):`
      : `В базе знаний это правило есть только для раздела ${names}; для вашего типа работы («${own.label.ru}») оно не указано:`;
  const parts = [...(rest.length ? [bullets(rest, locale)] : []), `${lead}\n${bullets(foreign, locale)}`];
  return { status: "answered", answer: parts.join("\n\n"), sources: v.sources, action: null, can_escalate: true };
}

function forHr(core: Core, locale: Locale): Core {
  if (core.status !== "answered") return { ...core, can_escalate: false };
  const answer = withoutHrHandoff(core.answer);
  if (!/\p{L}{3,}/u.test(answer.replace(/^\*\*.*\*\*$/gm, ""))) return noAnswer(locale, "hr");
  return { ...core, answer, can_escalate: false };
}

function localizeSources(sources: Source[], kb: KbArticle[], locale: Locale): Source[] {
  if (locale !== "kk") return sources;
  const local = kkTitles(config.kbDir);
  return sources.map((s) => {
    if (s.slug === PROFILE_SOURCE.slug) return PROFILE_SOURCE_KK;
    const title = kb.find((a) => a.slug === s.slug)?.title_kk ?? local.get(s.slug);
    return title ? { slug: s.slug, title } : s;
  });
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
