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

function monthOf(word: string | undefined): number | null {
  if (!word) return null;
  const w = word.toLowerCase();
  for (const [re, n] of MONTHS) if (re.test(w)) return n;
  return null;
}

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

function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function resolveYear(d: number, m: number, now: Date): string | null {
  const t = todayUtc(now);
  let y = t.getUTCFullYear();
  let iso = isoDate(y, m, d);
  if (iso && new Date(iso + "T00:00:00Z") < t) iso = isoDate(++y, m, d);
  return iso;
}

const VACATION_INTENT =
  /(хочу|хотел|хотела|планирую|собираюсь|оформ|подать|подам|возьму|взять|уйти|пойти|нужен|нужно|оформите|заявк)[\s\S]{0,40}отпуск|отпуск[\s\S]{0,15}(с|со)\s+\d|демалыс[\s\S]{0,40}(алғым|кеткім|рәсімде|өтінім|барғым)|(алғым|кеткім|барғым)[\s\S]{0,30}демалыс|\d{1,2}[\s\S]{0,25}(дейін|аралығында)[\s\S]{0,20}демалыс/i;

const ADVANCE_INTENT =
  /(хочу|нужен|нужна|оформ|подать|подам|взять|получить|прошу|запрос|заявк)[\s\S]{0,30}аванс|аванс[\s\S]{0,20}\d|аванс[\s\S]{0,40}(алғым|рәсімде|өтінім|керек)/i;

export function extractDateRange(text: string, now = new Date()): { start: string; end: string } | null {
  const t = text.toLowerCase().replace(/ё/g, "е");
  const iso = t.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso && iso.length >= 2 && parseIso(iso[0]) && parseIso(iso[1])) return { start: iso[0], end: iso[1] };
  const dm = [...t.matchAll(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/g)];
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
  const re =
    /(\d{1,2})(?:\s*[-–]?\s*(?:го|нан|нен|ден|дан|тан|тен)(?![а-яәғқңөұүһі]))?\s*([a-zа-яәғқңөұүһі]+)?\s*(?:по|до|[-–—]|және|мен)?\s*(\d{1,2})(?:\s*[-–]?\s*(?:го|ге|ға|ке|қа)(?![а-яәғқңөұүһі]))?\s*([a-zа-яәғқңөұүһі]+)/i;
  const m = re.exec(t);
  if (m) {
    const d1 = Number(m[1]);
    const d2 = Number(m[3]);
    const m2 = monthOf(m[4]);
    const m1 = monthOf(m[2]) ?? m2;
    if (m1 && m2) {
      const s = resolveYear(d1, m1, now);
      if (!s) return null;
      let y2 = Number(s.slice(0, 4));
      if (m2 < m1 || (m2 === m1 && d2 < d1)) y2 += 1;
      const e = isoDate(y2, m2, d2);
      if (e) return { start: s, end: e };
    }
  }
  return null;
}

export function extractAmount(text: string): number | null {
  const t = text.toLowerCase().replace(/[  ]/g, " ");
  const m = /(\d+)\s*(к(?!\p{L})|k(?!\p{L})|тыс|мың)?/iu.exec(t.replace(/(\d)\s+(?=\d{3}(?!\d))/g, "$1"));
  if (!m) return null;
  let n = Number(m[1].replace(/\s/g, ""));
  if (m[2]) n *= 1000;
  if (n < 100 && !m[2]) return null;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractReason(text: string): string {
  const m = /(?:на|для|потому что|так как|причина[:\s])\s+([^.!?]{3,80})/i.exec(text);
  return m ? m[1].trim() : "";
}

export interface DetectedIntent {
  type: "vacation" | "advance";
  start_date?: string;
  end_date?: string;
  amount?: number | null;
  reason?: string;
}

export function detectIntent(question: string, now = new Date()): DetectedIntent | null {
  if (VACATION_INTENT.test(question)) {
    const r = extractDateRange(question, now);
    return { type: "vacation", start_date: r?.start, end_date: r?.end };
  }
  if (ADVANCE_INTENT.test(question)) {
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

function fmt(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
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
    const start = parseIso(intent.start_date)!;
    const inPast = start < todayUtc(now);
    const exceeds = days > balance;
    const ru = [
      `Подготовил черновик заявки на ежегодный отпуск: с ${fmt(intent.start_date)} по ${fmt(intent.end_date)}, ${days} календарных дн.`,
      `Ваш остаток отпуска: ${balance} дн.`,
      exceeds ? `Внимание: запрошено ${days} дн., это больше вашего остатка (${balance} дн.). Сократите период или уточните у HR.` : "",
      inPast ? "Внимание: дата начала уже прошла — проверьте даты." : "",
      "Проверьте данные в форме и отправьте заявку сами — ассистент ничего не отправляет.",
    ];
    const kk = [
      `Жыл сайынғы демалысқа өтінім жобасы дайын: ${fmt(intent.start_date)} – ${fmt(intent.end_date)}, ${days} күнтізбелік күн.`,
      `Демалыс қалдығыңыз: ${balance} күн.`,
      exceeds ? `Назар аударыңыз: ${days} күн сұралды, бұл қалдықтан (${balance} күн) көп. Кезеңді қысқартыңыз немесе HR-дан нақтылаңыз.` : "",
      inPast ? "Назар аударыңыз: басталу күні өтіп кетті — күндерді тексеріңіз." : "",
      "Формадағы деректерді тексеріп, өтінімді өзіңіз жіберіңіз — көмекші ештеңе жібермейді.",
    ];
    return {
      action: {
        type: "prefill_request",
        request: { type: "vacation", payload: { start_date: intent.start_date, end_date: intent.end_date, days, comment } },
      },
      summary: (locale === "kk" ? kk : ru).filter(Boolean).join(" "),
      facts: [intent.start_date, intent.end_date, fmt(intent.start_date), fmt(intent.end_date), String(days), String(balance)],
      exceedsBalance: exceeds,
    };
  }
  const amount = intent.amount && intent.amount > 0 && intent.amount < 100_000_000 ? Math.round(intent.amount) : null;
  const reason = (intent.reason ?? "").slice(0, 200);
  const ru = `Подготовил черновик заявки на аванс${amount ? ` на сумму ${amount} ₸` : ""}. Проверьте сумму и причину в форме и отправьте заявку сами — ассистент ничего не отправляет.`;
  const kk = `Аванс өтінімінің жобасы дайын${amount ? `: ${amount} ₸` : ""}. Формадағы соманы және себебін тексеріп, өтінімді өзіңіз жіберіңіз — көмекші ештеңе жібермейді.`;
  return {
    action: { type: "prefill_request", request: { type: "advance", payload: { amount, reason } } },
    summary: locale === "kk" ? kk : ru,
    facts: amount ? [String(amount)] : [],
    exceedsBalance: false,
  };
}
