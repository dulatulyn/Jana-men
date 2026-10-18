import { U } from "./text.js";
import type { AssistantAction, Locale } from "./types.js";

const MONTHS: Array<[RegExp, number]> = [
  [/^(январ|янв|қаңтар)/, 1],
  [/^(феврал|фев|ақпан)/, 2],
  [/^(март|мар|наурыз)/, 3],
  [/^(апрел|апр|сәуір)/, 4],
  [/^(ма[йя]|мамыр)/, 5],
  [/^(июн|маусым)/, 6],
  [/^(июл|шілде)/, 7],
  [/^(август|авг|тамыз)/, 8],
  [/^(сентябр|сен|қыркүйек)/, 9],
  [/^(октябр|окт|қазан)/, 10],
  [/^(ноябр|ноя|қараша)/, 11],
  [/^(декабр|дек|желтоқсан)/, 12],
];

export function monthOf(word: string | undefined): number | null {
  if (!word) return null;
  const w = word.toLowerCase();
  for (const [re, n] of MONTHS) if (re.test(w)) return n;
  return null;
}

const MONTH_WORD = `(?:${MONTHS.map(([re]) => re.source.slice(2, -1)).join("|")})[a-zа-яәғқңөұүһі]*`;
const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const NOTICE_DAYS = 14;

export function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseIso(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return isoDate(y, m, d) ? new Date(Date.UTC(y, m - 1, d)) : null;
}

export function daysInclusive(start: string, end: string): number | null {
  const a = parseIso(start);
  const b = parseIso(end);
  if (!a || !b || b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

function dayFormat(tz: string): Intl.DateTimeFormat {
  let f = dayFormats.get(tz);
  if (!f) {
    const opts = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
    try {
      f = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "Asia/Almaty" });
    }
    dayFormats.set(tz, f);
  }
  return f;
}

export function localToday(now: Date, tz = process.env.APP_TZ?.trim() || "Asia/Almaty"): string {
  const parts = Object.fromEntries(dayFormat(tz).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function startOfToday(now: Date): Date {
  return new Date(`${localToday(now)}T00:00:00Z`);
}

function resolveYear(d: number, m: number, now: Date): string | null {
  const t = startOfToday(now);
  let y = t.getUTCFullYear();
  let iso = isoDate(y, m, d);
  if (iso && new Date(iso + "T00:00:00Z") < t) iso = isoDate(++y, m, d);
  return iso;
}

const VACATION_INTENT =
  /(хочу|хотел|хотела|планирую|собираюсь|оформ|подать|подам|возьму|взять|уйти|пойти|нужен|нужно|оформите|заявк)[\s\S]{0,40}отпуск|отпуск[\s\S]{0,15}(с|со)\s+\d|демалыс[\s\S]{0,40}(алғым|кеткім|рәсімде|өтінім|барғым)|(алғым|кеткім|барғым)[\s\S]{0,30}демалыс|\d{1,2}[\s\S]{0,25}(дейін|аралығында)[\s\S]{0,20}демалыс/i;

const ADVANCE_INTENT = U(
  /\b(хочу|хотел\S*|нужен|нужна|прошу|оформи|оформите|подам|возьму)\b[\s\S]{0,30}аванс|аванс[\s\S]{0,40}(алғым|рәсімде|(?<!не\s)керек)/i,
);

const EXPENSE_REPORT = /(авансов\S*\s+отч|аванс\S*\s+есеп)/i;

const NOT_OWN = U(
  /(напарник|подчин[её]н|коллег(е|и|у|ам)\b|коллег[аи]\s+(хоч|хот|прос|спраш|нужн)|\b(мо[йяеи]\S*|наш\S*)\s+(сотрудни|курьер|работник)|сотрудни(ку|ка|це|цы|кам|ков|ки)\b|(?<!\bя\s)сотрудни(к|ца)\s+(\S+\s+)?(хоч|хот|прос|спраш|нужн)|курьер\S*\s+из|\b(ему|ей)\b|әріптес|қызметкер(ге|дің|ім|іме|імнің|лерге|лердің)\b|\b(отклон(ить|яю|ять)|одобр(ить|яю|ять)|утвердить|утвержда(ю|ть)|келісемін|мақұлда(ймын|у)|бекіт(емін|у))\b|согласов(ать|ывать|ываю)\s+(\S+\s+){0,2}заявк|провести\s+(\S+\s+){0,2}(в\s+1с|заявк|приказ))/i,
);

export function notOwnRequest(question: string): boolean {
  return NOT_OWN.test(question);
}

export function mentionsVacation(question: string): boolean {
  return VACATION_INTENT.test(question) || /(отпуск|демалыс|отдых|отгул)/i.test(question);
}

const RANGE = new RegExp(
  `(?<![\\d.])(\\d{1,2})(?![\\d.])(?:\\s*[-–]?\\s*(?:го|(нан|нен|ден|дан|тан|тен))(?![а-яәғқңөұүһі]))?\\s*(${MONTH_WORD})?\\s*(по|до|[-–—]|және|мен)?\\s*(?<![\\d.])(\\d{1,2})(?![\\d.])(?:\\s*[-–]?\\s*(?:го|е|ое|ге|ға|ке|қа)(?![а-яәғқңөұүһі]))?\\s*(${MONTH_WORD})(?:\\s*(20\\d{2})(?!\\d))?`,
  "giu",
);

export function extractDateRange(text: string, now = new Date()): { start: string; end: string } | null {
  const t = text.toLowerCase().replace(/ё/g, "е");
  const iso = t.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso && iso.length >= 2 && parseIso(iso[0]) && parseIso(iso[1])) return { start: iso[0], end: iso[1] };
  const dm = [...t.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/g)];
  if (dm.length >= 2) {
    const mk = (g: RegExpMatchArray) => {
      const d = Number(g[1]);
      const m = Number(g[2]);
      if (g[3]) {
        const y = Number(g[3].length === 2 ? "20" + g[3] : g[3]);
        return isoDate(y, m, d);
      }
      return resolveYear(d, m, now);
    };
    const s = mk(dm[0]);
    let e = mk(dm[1]);
    if (s && e && e < s && !dm[1][3]) e = isoDate(Number(e.slice(0, 4)) + 1, Number(e.slice(5, 7)), Number(e.slice(8, 10)));
    if (s && e) return { start: s, end: e };
  }
  for (const m of t.matchAll(RANGE)) {
    if (!m[2] && !m[3] && !m[4]) continue;
    const d1 = Number(m[1]);
    const d2 = Number(m[5]);
    const m2 = monthOf(m[6]);
    if (!m2) continue;
    const explicit = monthOf(m[3]);
    if (explicit === m2 && d1 > d2) return null;
    const m1 = explicit ?? (d1 > d2 ? (m2 === 1 ? 12 : m2 - 1) : m2);
    let s: string | null;
    let e: string | null;
    if (m[7]) {
      const yEnd = Number(m[7]);
      s = isoDate(m1 > m2 || (m1 === m2 && d1 > d2) ? yEnd - 1 : yEnd, m1, d1);
      e = isoDate(yEnd, m2, d2);
    } else {
      s = resolveYear(d1, m1, now);
      if (!s) return null;
      e = isoDate(Number(s.slice(0, 4)) + (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0), m2, d2);
    }
    return s && e && e >= s ? { start: s, end: e } : null;
  }
  return null;
}

const DAY_MONTH = new RegExp(
  `(?<![\\d.])(\\d{1,2})(?![\\d.])(?:\\s*[-–]?\\s*(?:го|е|ое|нан|нен|ден|дан|тан|тен|ге|ға|ке|қа)(?![а-яәғқңөұүһі]))?\\s*(${MONTH_WORD})`,
  "giu",
);

export function impossibleDate(text: string): string | null {
  const t = text.toLowerCase().replace(/ё/g, "е");
  for (const m of t.matchAll(DAY_MONTH)) {
    const d = Number(m[1]);
    const mo = monthOf(m[2]);
    if (mo && d >= 1 && d <= 31 && d > MAX_DAY[mo - 1]) return m[0].trim();
  }
  for (const m of t.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/g)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && d > MAX_DAY[mo - 1]) return m[0];
  }
  return null;
}

const SALARY_CONTEXT = /(оклад|зарплат|зп|получаю|айлық|жалақ)\S*\s+(\p{L}+\s+){0,2}$/u;

export function extractAmount(text: string): number | null {
  const t = text
    .toLowerCase()
    .replace(/[  ]/g, " ")
    .replace(/(\d)\s+(?=\d{3}(?!\d))/g, "$1");
  for (const m of t.matchAll(/(\d+)\s*(к(?!\p{L})|k(?!\p{L})|тыс|мың)?/giu)) {
    const at = m.index ?? 0;
    if (SALARY_CONTEXT.test(t.slice(Math.max(0, at - 30), at))) continue;
    const n = Number(m[1]) * (m[2] ? 1000 : 1);
    if (Number.isFinite(n) && n >= 100) return n;
  }
  return null;
}

const REASON = U(/\b(?:на|для|потому\s+что|так\s+как|причина[:\s])\s+(?!сумм|\d)([^.!?,;]{3,80})/i);

function extractReason(text: string): string {
  return REASON.exec(text)?.[1].trim() ?? "";
}

export interface DetectedIntent {
  type: "vacation" | "advance";
  start_date?: string;
  end_date?: string;
  amount?: number | null;
  reason?: string;
}

export function detectIntent(question: string, now = new Date()): DetectedIntent | null {
  if (notOwnRequest(question)) return null;
  if (VACATION_INTENT.test(question)) {
    const r = extractDateRange(question, now);
    return { type: "vacation", start_date: r?.start, end_date: r?.end };
  }
  if (ADVANCE_INTENT.test(question) && !EXPENSE_REPORT.test(question)) {
    return { type: "advance", amount: extractAmount(question), reason: extractReason(question) };
  }
  return null;
}

export interface BuiltAction {
  action: AssistantAction;
  summary: string;
  facts: string[];
  exceedsBalance: boolean;
}

export function fmt(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function dateFacts(iso: string): string[] {
  return [iso, fmt(iso), String(Number(iso.slice(8, 10))), String(Number(iso.slice(5, 7)))];
}

export function buildAction(
  intent: DetectedIntent,
  balance: number,
  locale: Locale,
  now = new Date(),
  comment = "",
): BuiltAction | null {
  if (intent.type === "vacation") {
    if (!intent.start_date || !intent.end_date) return null;
    const days = daysInclusive(intent.start_date, intent.end_date);
    if (!days || days > 366) return null;
    const lead = Math.round((parseIso(intent.start_date)!.getTime() - startOfToday(now).getTime()) / 86_400_000);
    const inPast = lead < 0;
    const late = lead >= 0 && lead < NOTICE_DAYS;
    const exceeds = days > balance;
    const ru = [
      `Подготовил черновик заявки на ежегодный отпуск: с ${fmt(intent.start_date)} по ${fmt(intent.end_date)}, ${days} календарных дн.`,
      `Ваш остаток отпуска: ${balance} дн.`,
      exceeds ? `Внимание: запрошено ${days} дн., это больше вашего остатка (${balance} дн.). Сократите период или уточните у HR.` : "",
      inPast ? "Внимание: дата начала уже прошла — проверьте даты." : "",
      late
        ? `Внимание: заявку на отпуск нужно подавать не позднее чем за ${NOTICE_DAYS} календарных дней до даты начала отпуска, а ${lead === 0 ? "отпуск начинается сегодня." : `до начала осталось ${lead} дн.`} Согласуйте даты с руководителем.`
        : "",
      "Проверьте данные в форме и отправьте заявку сами — ассистент ничего не отправляет.",
    ];
    const kk = [
      `Жыл сайынғы демалысқа өтінім жобасы дайын: ${fmt(intent.start_date)} – ${fmt(intent.end_date)}, ${days} күнтізбелік күн.`,
      `Демалыс қалдығыңыз: ${balance} күн.`,
      exceeds ? `Назар аударыңыз: ${days} күн сұралды, бұл қалдықтан (${balance} күн) көп. Кезеңді қысқартыңыз немесе HR-ден нақтылаңыз.` : "",
      inPast ? "Назар аударыңыз: басталу күні өтіп кетті — күндерді тексеріңіз." : "",
      late
        ? `Назар аударыңыз: демалысқа өтінімді демалыс басталатын күннен кемінде ${NOTICE_DAYS} күнтізбелік күн бұрын беру керек, ал ${lead === 0 ? "демалыс бүгін басталады." : `басталуына ${lead} күн қалды.`} Күндерді басшыңызбен келісіңіз.`
        : "",
      "Формадағы деректерді тексеріп, өтінімді өзіңіз жіберіңіз — көмекші ештеңе жібермейді.",
    ];
    return {
      action: {
        type: "prefill_request",
        request: { type: "vacation", payload: { start_date: intent.start_date, end_date: intent.end_date, days, comment } },
      },
      summary: (locale === "kk" ? kk : ru).filter(Boolean).join(" "),
      facts: [...dateFacts(intent.start_date), ...dateFacts(intent.end_date), String(days), String(balance), ...(late ? [String(NOTICE_DAYS), String(lead)] : [])],
      exceedsBalance: exceeds,
    };
  }
  const amount = intent.amount && intent.amount > 0 && intent.amount < 100_000_000 ? Math.round(intent.amount) : null;
  const reason = (intent.reason ?? "").slice(0, 200);
  const ru = `Подготовил черновик заявки на аванс${amount ? ` на сумму ${amount} ₸` : ""}. По правилам компании сумма дополнительного аванса — не более 50% оклада за месяц, а подать заявку можно не чаще одного раза в месяц. Проверьте сумму и причину в форме и отправьте заявку сами — ассистент ничего не отправляет.`;
  const kk = `Аванс өтінімінің жобасы дайын${amount ? `: ${amount} ₸` : ""}. Компания ережесі бойынша қосымша аванс сомасы айлықтың 50%-ынан аспауы керек, ал өтінімді айына бір реттен жиі беруге болмайды. Формадағы соманы және себебін тексеріп, өтінімді өзіңіз жіберіңіз — көмекші ештеңе жібермейді.`;
  return {
    action: { type: "prefill_request", request: { type: "advance", payload: { amount, reason } } },
    summary: locale === "kk" ? kk : ru,
    facts: amount ? [String(amount), "50"] : ["50"],
    exceedsBalance: false,
  };
}
