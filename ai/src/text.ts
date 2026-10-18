const BOUNDARY = "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";

export function U(re: RegExp): RegExp {
  return new RegExp(re.source.split("\\b").join(BOUNDARY), re.flags.includes("u") ? re.flags : re.flags + "u");
}

const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤﻿]/g;

export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE, "");
}

export function splitSentences(line: string): string[] {
  return line.split(/(?<=[.!?…])\s+/);
}

export function keepSentences(text: string, keep: (sentence: string) => boolean): string {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      lines.push("");
      continue;
    }
    const marker = /^\s*(?:[-*•]|\d+[.)])\s+/.exec(line)?.[0] ?? "";
    const kept = splitSentences(line.slice(marker.length)).filter(keep).join(" ");
    if (kept.trim()) lines.push(marker + kept);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»“”„"'‘’`]/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[*_#>]/g, " ")
    .replace(/(\d)[\s  ](?=\d{3}\b)/g, "$1")
    .replace(/[\s  ]+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .trim();
}

export function trimQuote(s: string): string {
  return s.replace(/^[\s.…,;:!?()\-–—]+|[\s.…,;:!?()\-–—]+$/g, "");
}

const STOP = new Set(
  (
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтобы без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это мне какие какое каком каких сколько нужно ли подскажите скажите пожалуйста хочу хотел хотела могу можно ли есть мои моё мое длится делать сделать начинается узнать получить взять дают дает даёт бывает какую какого нужен нужна " +
    "мен сен ол біз сіз олар және бен мен пен да де та те ма ме ба бе па пе ше қалай қанша қайда кім не неше бар жоқ үшін туралы болады бола ма ме ба бе"
  ).split(/\s+/),
);

export function stem(w: string): string {
  const p = w.slice(0, 5);
  const q = p.replace(/[аеёиоуыэюяьъй]+$/u, "");
  return q.length >= 3 ? q : p;
}

const SYNONYMS_RAW: Record<string, string[]> = {
  демал: ["отпуск"],
  жалақ: ["заработн", "зарплат"],
  айлық: ["заработн", "зарплат"],
  зарпл: ["заработн", "выплат"],
  когда: ["срок", "числа"],
  қашан: ["срок", "числа"],
  жыл: ["год"],
  сайын: ["ежегодн"],
  ауру: ["больничн", "нетрудоспособност"],
  науқа: ["больничн"],
  ауырд: ["больничн", "заболел"],
  ауырс: ["больничн", "заболел"],
  больн: ["нетрудоспособност"],
  забол: ["больничн"],
  болею: ["больничн"],
  болен: ["больничн"],
  іссап: ["командировк"],
  анықт: ["справк"],
  кесте: ["график"],
  ауысы: ["смен"],
  бейім: ["онбординг"],
  оқу: ["обучени", "курс"],
  оқыт: ["обучени"],
  курс: ["курс", "academy"],
  тест: ["тест"],
  ауыст: ["перенос"],
  ұзарт: ["продлени"],
  жаңа: ["новых", "новый"],
  қызме: ["сотрудник"],
  күн: ["дней", "дня"],
  күні: ["дней", "дня"],
  ақша: ["аванс"],
  төлем: ["выплат"],
  төлеу: ["выплат"],
  байла: ["контакт"],
  нөмір: ["номер"],
  поезд: ["командировк"],
  суточ: ["суточн", "командировк"],
  отпус: ["отпуск"],
  уволь: ["увольнени"],
  телефон: ["номер"],
  свадь: ["брак"],
  үйлен: ["брак"],
  тәулі: ["суточн"],
  тұру: ["проживани"],
  қонақ: ["гостиниц", "проживани"],
  есеп: ["отчет"],
  сынақ: ["испытательн"],
  мерзі: ["срок"],
  түнгі: ["ночн"],
  күнді: ["дневн"],
  кеңсе: ["офис"],
  қойма: ["склад"],
  сұрып: ["сортировочн"],
  бөлік: ["част", "раздели"],
  бөлу: ["раздели"],
  тәлім: ["наставник"],
  сертиф: ["справк"],
  жұмыс: ["работ"],
  сағат: ["час"],
  үстем: ["сверхурочн"],
};

const SYNONYMS: Record<string, string[]> = {};
for (const [k, v] of Object.entries(SYNONYMS_RAW)) (SYNONYMS[stem(k)] ??= []).push(...v);

export function tokenize(s: string): string[] {
  return (
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((t) => t.length > 1 && !STOP.has(t));
}

export function stemGroups(s: string): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const t of tokenize(s)) {
    const st = stem(t);
    if (seen.has(st)) continue;
    seen.add(st);
    out.push([st, ...(SYNONYMS[st] ?? []).map(stem)]);
  }
  return out;
}

export function stems(s: string, expand = false): string[] {
  const out: string[] = [];
  for (const t of tokenize(s)) {
    const st = stem(t);
    out.push(st);
    if (expand) for (const syn of SYNONYMS[st] ?? []) out.push(stem(syn));
  }
  return out;
}
