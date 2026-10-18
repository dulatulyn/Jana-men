import { monthOf } from "./action.js";
import { keepSentences, stripInvisible, U } from "./text.js";
import type { Locale, Profile, UserRole } from "./types.js";

export type RefusalReason = "injection" | "other_person" | "hr_decision";

export interface GuardResult {
  reason: RefusalReason;
  pattern: string;
}

const INJECTION: RegExp[] = ([
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)?\s*(instructions|rules|prompts?)/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\b/i,
  /\bact\s+as\b/i,
  /\b(developer|dev|god|admin|debug)\s+mode\b/i,
  /\bjail\s*break|\bDAN\b/i,
  /system\s+prompt|your\s+instructions/i,
  /(игнорир|проигнорир|забудь|забудьте|отбрось|не\s+следуй|отмени)\S*\s+(\S+\s+){0,3}(инструкц|правил|ограничени|промпт|указани)/i,
  /(предыдущ|прошл|все)\S*\s+(инструкц|правил)\S*\s+(не\s+действ|отмен|больше\s+не)/i,
  /ты\s+(теперь|больше\s+не)\b/i,
  /теперь\s+ты\b/i,
  /(представь|притворись|вообрази|сыграй\s+роль)/i,
  /(системн\S*\s+(промпт|подсказ|инструкц|сообщени))|(покажи|выведи|раскрой|напечатай)\s+(\S+\s+){0,2}(промпт|инструкц|prompt)/i,
  /режим\s+(разработчика|администратора|бога|отладки)/i,
  /без\s+(каких-либо\s+)?(ограничений|фильтров|цензуры)/i,
  /(нұсқау|ереже)\S*\s+(\S+\s+)?(елеме|ұмыт|елемеңіз|ұмытыңыз)/i,
  /сен\s+енді\b|сіз\s+енді\b/i,
] as RegExp[]).map(U);

const PD_TOPIC = U(
  /(зарплат|зп\b|оклад|получает|зарабатыва|доход|преми|бонус|телефон|номер|адрес|иин|паспорт|день\s+рожден|дата\s+рожден|возраст|семейн|женат|замуж|дет(и|ей)\b|больнич|болеет|отпуск|увол|штраф|выговор|характеристик|оценк|данн|профил|стаж|жалақ|айлық|табыс|мекенжай|туған|демалыс|телефоны|нөмір)/i,
);

const THIRD_PARTY = U(
  /(коллег|подчинен|начальник(а|у)\b|у\s+него|у\s+нее|\b(его|ее)\s+(зарплат|оклад|доход|преми|телефон|номер|адрес|отпуск|больнич|данн|профил|стаж)|другого|других|чуж|всех\s+(сотрудник|работник|людей|коллег)|кто\s+из|әріптес|қызметкерлер|басқа\s+адам|оның)/i,
);

const MANAGER_NAMED = U(/руководител(я|ю|ем)\s+[А-ЯЁ][а-яё]/);

const STRONG_PD = U(
  /(зарплат|зп\b|оклад|получает|зарабатыва|доход|преми|бонус|телефон|номер\s+телефон|адрес|иин|паспорт|рожден|возраст|семейн|женат|замуж|болеет|диагноз|штраф|выговор|характеристик|жалақ|айлық|табыс|мекенжай|туған)/i,
);
const ROLE = U(/(руководител|начальник|директор|(?<!hr[-\s]?)менеджер|бухгалтер(?!и)|курьер|кладовщик|коллег|басшы|директоры)/i);

const BULK = U(
  /((список|списки|перечень|перечисли|выгрузи|покажи|выведи|дай)\s+(\S+\s+){0,3}(сотрудник|работник|персонал|людей|коллег|зарплат|отпуск))|(все(х|м)?\s+(сотрудник|работник)\S*\s+(\S+\s+){0,2}(зарплат|отпуск|данн|телефон|адрес))|(барлық\s+қызметкер)/i,
);

const HR_DECISION: RegExp[] = ([
  /\b(одобри|одобрите|утверди|утвердите|согласуй|согласуйте|отклони|отклоните|подпиши|подпишите|проведи|проведите|подтверди|подтвердите)\b(\s+\S+){0,3}\s*(заявк|отпуск|аванс|приказ)/i,
  /\b(уволь|увольте|уволи|повысь|повысьте|понизь|накажи|оштрафуй|назначь|назначьте|начисли|начислите|выпиши|выдай)\b(?!\s+(мне\s+)?(справк|курс))/i,
  /(уволят|повысят|сократят|дадут\s+ли\s+мне\s+премию|получу\s+ли\s+(я\s+)?премию)/i,
  /(реши|решите|прими|примите)\s+(\S+\s+){0,2}(решени|за\s+hr|за\s+руководител)/i,
  /((мақұлда|бекіт|раста)(шы|ші|ңыз|ңызшы|іңіз|іңізші|ыңыз|ыңызшы)\b|(мақұлдап|бекітіп|растап)\s+(бер|жібер)(ші|іңіз|іңізші)?\b|(мақұлдап|бекітіп|растап)\s+(бере|жібере)\s+ал|жұмыстан\s+шығар(ыңыз|шы)?\b)/i,
] as RegExp[]).map(U);

const NAME_STEMS =
  "ерлан|асел|даулет|динар|айгерим|марат|гульнар|нурлан|али[яиюе]|айжан|бауыржан|арман|алмас|данияр|жанн|сауле|айдос|ержан|мадин|аружан|асхат|серик|бахыт|иван|ольг|анн[аыеуо]|серге|алексе|елен|мари[яиюе]";
const FIRST_NAME = new RegExp(`^(${NAME_STEMS})\\p{L}{0,4}$`, "iu");
const LOWER_NAME = new RegExp(
  `^(${NAME_STEMS.replace("|арман|алмас", "")})(а|я|у|ю|е|ы|и|ой|ей|ом|ем|й|ге|ке|ға|қа|ды|ді|ты|ті|ны|ні|да|де|та|те|дан|ден|тан|тен|нан|нен|мен|бен|пен|ның|нің|дың|дің|тың|тің)?$`,
  "iu",
);
const SURNAME = /(ов|ев|ин|ова|ева|ина|ову|еву|ину|овой|евой|иной|овым|евым|иным|овна|евна|ович|евич|улы|ұлы|кызы|қызы)$/i;
const NOT_SURNAMES = new Set([
  "готов", "готова", "снова", "слова", "основа", "основы", "половина", "половину", "причина", "причину", "машина", "магазин", "мужчина",
  "картина", "здорова", "здоров", "каков", "таков", "никаков", "вершина", "середина", "величина", "глубина", "новой", "иной",
]);
const PLACES =
  /^(казахстан|қазақстан|алмат|астан|шымкент|караганд|қарағанд|актобе|ақтөбе|атырау|актау|ақтау|павлодар|костанай|қостанай|тараз|кызылорд|қызылорд|семей|туркестан|түркістан|кокшетау|көкшетау|уральск|петропавл|талдыкорган|талдықорған|экибастуз|екібастұз|темиртау|теміртау|жезказган|жезқазған|москв|росси|турци|германи|китай|дубай|республик|трудов|кодекс)\p{L}{0,3}$/u;
const NOT_NAME_WORDS = new Set(["jana", "post", "academy", "janamen", "hr", "тк", "рк", "зуп", "documentolog", "ассистент", "наурыз", "курбан", "құрбан", "ораза", "жаңа", "новый"]);
const notAName = (base: string) => NOT_NAME_WORDS.has(base) || PLACES.test(base);
const PRONOUNS = new Set(["меня", "нас", "вас", "тебя", "себя", "мне", "нам", "вам"]);
const CAP = /^[А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі]{2,}$/;
const GEN = /(ның|нің|дың|дің|тың|тің)$/;
const ADJECTIVE = /(ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ых|их|ую|юю)$/;

function looksLikeOtherPerson(q: string, self?: Profile): boolean {
  const selfParts = new Set(
    (self?.full_name ?? "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.slice(0, 4)),
  );
  const isSelf = (w: string) => selfParts.has(w.toLowerCase().replace(/ё/g, "е").slice(0, 4));
  const words = [...q.matchAll(/\p{L}+/gu)];
  for (let i = 0; i < words.length; i++) {
    const w = words[i][0];
    const at = words[i].index ?? 0;
    if (isSelf(w)) continue;
    const lower = w.toLowerCase().replace(/ё/g, "е");
    const base = lower.replace(GEN, "");
    if (notAName(base)) continue;
    if (!CAP.test(w)) {
      if (LOWER_NAME.test(lower.replace(/ь/g, ""))) return true;
      continue;
    }
    if (FIRST_NAME.test(base.replace(/ь/g, ""))) return true;
    if (w.length >= 5 && SURNAME.test(base) && !NOT_SURNAMES.has(base)) return true;
    const before = q.slice(0, at);
    if (/^\s*$|[.!?…]\s*$|\n\s*$/.test(before) || PRONOUNS.has(lower)) continue;
    if (/(?:^|[^\p{L}])у\s+$/iu.test(before)) return true;
    const next = words[i + 1];
    if (
      next &&
      CAP.test(next[0]) &&
      !ADJECTIVE.test(lower) &&
      /^\s+$/.test(q.slice(at + w.length, next.index)) &&
      !notAName(next[0].toLowerCase().replace(/ё/g, "е").replace(GEN, "")) &&
      !monthOf(next[0])
    )
      return true;
  }
  return false;
}

export function guardText(question: string): string {
  return stripInvisible(question.normalize("NFKC")).replace(/ё/g, "е").replace(/Ё/g, "Е");
}

export function preFilter(question: string, self?: Profile): GuardResult | null {
  const q = guardText(question);
  for (const re of INJECTION) if (re.test(q)) return { reason: "injection", pattern: re.source };
  if (BULK.test(q)) return { reason: "other_person", pattern: "bulk" };
  for (const re of HR_DECISION) if (re.test(q)) return { reason: "hr_decision", pattern: re.source };
  if (PD_TOPIC.test(q) && (THIRD_PARTY.test(q) || MANAGER_NAMED.test(q) || looksLikeOtherPerson(q, self)))
    return { reason: "other_person", pattern: "pd+third_party" };
  if (STRONG_PD.test(q) && ROLE.test(q)) return { reason: "other_person", pattern: "strong_pd+role" };
  return null;
}

export const MESSAGES = {
  refused: {
    injection: {
      ru: "Я HR-ассистент JanaMen и работаю только по базе знаний компании. Изменить мои правила нельзя. Задайте, пожалуйста, вопрос по кадровым темам: отпуск, аванс, больничный, график, обучение.",
      kk: "Мен JanaMen HR-көмекшісімін және тек компанияның білім базасы бойынша жұмыс істеймін. Ережелерімді өзгерту мүмкін емес. Кадр мәселесі бойынша сұрақ қойыңыз: демалыс, аванс, ауру парағы, кесте, оқу.",
    },
    other_person: {
      ru: "Я не могу раскрывать данные других сотрудников (зарплату, отпуск, контакты и другие личные данные). Я вижу только ваш собственный профиль. Если вопрос рабочий, его можно передать в HR.",
      kk: "Мен басқа қызметкерлердің деректерін (жалақы, демалыс, байланыс және басқа жеке деректер) аша алмаймын. Мен тек сіздің жеке профиліңізді көремін. Сұрақ жұмысқа қатысты болса, оны HR-ге жіберуге болады.",
    },
    hr_decision: {
      ru: "Я не принимаю кадровых решений: согласование заявок, премии, увольнения и назначения делают руководитель и HR. Могу подсказать порядок по базе знаний или передать вопрос в HR.",
      kk: "Мен кадрлық шешім қабылдамаймын: өтінімдерді келісуді, сыйақыны, жұмыстан босатуды басшы мен HR шешеді. Білім базасы бойынша тәртібін айтып бере аламын немесе сұрағыңызды HR-ге жібере аламын.",
    },
    model: {
      ru: "К сожалению, я не могу ответить на этот вопрос. Он вне моих полномочий как HR-ассистента. Могу передать его в HR.",
      kk: "Өкінішке қарай, бұл сұраққа жауап бере алмаймын. Ол HR-көмекшінің құзыретінен тыс. Оны HR-ге жібере аламын.",
    },
  },
  no_answer: {
    ru: "В базе знаний нет надёжной информации по этому вопросу, поэтому я не буду отвечать наугад. Можно передать вопрос HR-специалисту — нажмите «Передать в HR».",
    kk: "Білім базасында бұл сұрақ бойынша сенімді ақпарат жоқ, сондықтан болжам айтпаймын. Сұрақты HR маманына жіберуге болады — «HR-ге жіберу» батырмасын басыңыз.",
  },
  hr: {
    refused: {
      other_person: {
        ru: "Я не могу раскрывать данные других сотрудников (зарплату, отпуск, контакты и другие личные данные). Я вижу только ваш собственный профиль. Данные сотрудников смотрите в разделах платформы, доступных по вашей роли.",
        kk: "Мен басқа қызметкерлердің деректерін (жалақы, демалыс, байланыс және басқа жеке деректер) аша алмаймын. Мен тек сіздің жеке профиліңізді көремін. Қызметкерлер деректерін рөліңізге қолжетімді платформа бөлімдерінен қараңыз.",
      },
      hr_decision: {
        ru: "Я не принимаю кадровых решений: согласование заявок, премии, увольнения и назначения делают руководитель и HR. Могу подсказать порядок по базе знаний.",
        kk: "Мен кадрлық шешім қабылдамаймын: өтінімдерді келісуді, сыйақыны, жұмыстан босатуды басшы мен HR шешеді. Білім базасы бойынша тәртібін айтып бере аламын.",
      },
      model: {
        ru: "К сожалению, я не могу ответить на этот вопрос. Он вне моих полномочий как HR-ассистента.",
        kk: "Өкінішке қарай, бұл сұраққа жауап бере алмаймын. Ол HR-көмекшінің құзыретінен тыс.",
      },
    },
    no_answer: {
      ru: "В базе знаний нет надёжной информации по этому вопросу, поэтому я не буду отвечать наугад. Добавьте статью в базу знаний, чтобы ассистент начал отвечать.",
      kk: "Білім базасында бұл сұрақ бойынша сенімді ақпарат жоқ, сондықтан болжам айтпаймын. Көмекші жауап бере бастауы үшін білім базасына мақала қосыңыз.",
    },
  },
} as const;

const OFFERS_HR = /(переда\S*|направ\S*|перешл\S*|обрат\S*)\s+(\S+\s+){0,3}(в|к)\s+HR|«Передать в HR»|«HR-ге жіберу»|HR\S*\s+(\S+\s+)?жібер/i;

export function offersHrHandoff(text: string): boolean {
  return OFFERS_HR.test(text);
}

export function withoutHrHandoff(text: string): string {
  return keepSentences(text, (s) => !offersHrHandoff(s));
}

export type SmallTalk = "greeting" | "thanks";

const GREETING_WORDS = U(
  /(привет\S*|здравствуй\S*|добр(ый|ое|ого)\s+(день|утро|вечер|дня|утра|вечера)|доброго\s+времени\s+суток|салам|сәлеметсіз\s*бе|сәлем\S*|салем|қайырлы\s+(таң|күн|кеш)|\bhi\b|\bhello\b|\bhey\b|как\s+дела|как\s+ты|как\s+вы|қалайсыз)/giu,
);
const THANKS_WORDS = U(
  /(спасибо|благодарю|большое|огромное|рахмет|рақмет|сізге|көп|понятно|ясно|\bок\b|окей|\bok\b|\bokay\b|хорошо|отлично|супер|\bthanks\b|thank\s+you|түсінікті|түсіндім|жақсы)/giu,
);

export function detectSmallTalk(question: string): SmallTalk | null {
  const t = guardText(question).toLowerCase();
  if (t.length > 60) return null;
  const rest = t.replace(GREETING_WORDS, " ");
  const greeting = rest !== t;
  const left = rest.replace(THANKS_WORDS, " ");
  if (left === t || /\p{L}|\p{N}/u.test(left)) return null;
  return greeting ? "greeting" : "thanks";
}

const SMALL_TALK = {
  greeting: {
    ru: "Здравствуйте! Я HR-ассистент JanaMen. Спросите про отпуск, аванс, больничный, график, командировки, обучение или справки.",
    kk: "Сәлеметсіз бе! Мен JanaMen HR-көмекшісімін. Демалыс, аванс, ауру парағы, жұмыс кестесі, іссапар, оқу немесе анықтамалар туралы сұраңыз.",
  },
  thanks: {
    ru: "Пожалуйста! Если появятся вопросы про отпуск, аванс, больничный, график или справки — спрашивайте.",
    kk: "Оқасы жоқ! Демалыс, аванс, ауру парағы, кесте немесе анықтамалар туралы сұрағыңыз болса, жазыңыз.",
  },
} as const;

export function smallTalkMessage(kind: SmallTalk, locale: Locale): string {
  return SMALL_TALK[kind][locale];
}

export function badDateMessage(date: string, locale: Locale): string {
  return locale === "kk"
    ? `«${date}» деген күн күнтізбеде жоқ. Демалыс күндерін нақтылаңыз — мен өтінім жобасын дайындаймын.`
    : `Даты «${date}» нет в календаре. Уточните, пожалуйста, даты отпуска — и я подготовлю черновик заявки.`;
}

export function refusalMessage(reason: RefusalReason | "model", locale: Locale, role: UserRole = "employee"): string {
  if (role === "hr" && reason !== "injection") return MESSAGES.hr.refused[reason][locale];
  return MESSAGES.refused[reason][locale];
}

export function noAnswerMessage(locale: Locale, role: UserRole = "employee"): string {
  return role === "hr" ? MESSAGES.hr.no_answer[locale] : MESSAGES.no_answer[locale];
}
