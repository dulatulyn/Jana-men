import type { Locale, Profile } from "./types.js";

const WORK_TYPE: Record<string, string> = { office: "офис", warehouse: "склад / сортировочный центр", courier: "курьер" };

export function renderProfile(p: Profile): string {
  return [
    `ФИО: ${p.full_name}`,
    `Компания: ${p.company}`,
    `Должность: ${p.position}`,
    `Подразделение: ${p.department}`,
    `Руководитель: ${p.manager?.full_name ?? "не указан"}`,
    `Дата приёма: ${p.hire_date}`,
    `Остаток ежегодного отпуска: ${p.vacation_balance_days} дн.`,
    `Тип работы: ${WORK_TYPE[p.work_type ?? ""] ?? p.work_type ?? "не указан"}`,
  ].join("\n");
}

export function profileValues(p: Profile): string[] {
  return [
    p.full_name,
    p.company,
    p.position,
    p.department,
    p.manager?.full_name ?? "",
    p.hire_date,
    String(p.vacation_balance_days),
    p.work_type ?? "",
  ].filter(Boolean);
}

type Field = "vacation_balance" | "manager" | "hire_date" | "position" | "department" | "company";

const SELF = /(у\s+меня|мой|моя|моё|мое|мои|мне|меня|я\s|менің|маған|мен\s|бар\s+ма|қалды)/i;

const FIELDS: Array<[Field, RegExp]> = [
  ["vacation_balance", /(остал|остаток|осталось|сколько\s+(\S+\s+){0,3}(дн|отпуск)|қалды|қалдық|қанша\s+(\S+\s+){0,2}(күн|демалыс))[\s\S]*?(отпуск|дн|демалыс|күн)|(отпуск|демалыс)[\s\S]{0,30}(остал|остаток|қалды|қалдық)/i],
  ["manager", /(руководител|начальник|басшы|менеджер)/i],
  ["hire_date", /(дата\s+при[её]ма|когда\s+(меня\s+)?(приняли|устроил)|стаж|жұмысқа\s+(қабылд|кірген|орналас))/i],
  ["position", /(должност|лауазым|кем\s+я\s+работаю)/i],
  ["department", /(подразделени|отдел|бөлім)/i],
  ["company", /(в\s+какой\s+компании|компания\s+(\S+\s+)?(работаю)|қай\s+компания)/i],
];

export function detectProfileQuestion(q: string): Field | null {
  if (!SELF.test(q + " ")) return null;
  if (/(положен|по\s+закону|минимальн|тиесілі)/i.test(q) && !/(остал|остаток|қалды|қалдық)/i.test(q)) return null;
  for (const [f, re] of FIELDS) if (re.test(q)) return f;
  return null;
}

export function answerProfile(f: Field, p: Profile, locale: Locale): { answer: string; facts: string[] } {
  const kk = locale === "kk";
  switch (f) {
    case "vacation_balance":
      return {
        answer: kk
          ? `1С:ЗУП деректері бойынша сіздің жыл сайынғы ақылы демалыс қалдығыңыз — ${p.vacation_balance_days} күн.`
          : `По данным 1С:ЗУП, у вас осталось ${p.vacation_balance_days} дн. ежегодного оплачиваемого отпуска.`,
        facts: [String(p.vacation_balance_days)],
      };
    case "manager":
      return {
        answer: kk
          ? `Сіздің басшыңыз — ${p.manager?.full_name ?? "көрсетілмеген"}.`
          : `Ваш непосредственный руководитель — ${p.manager?.full_name ?? "не указан"}.`,
        facts: [],
      };
    case "hire_date":
      return {
        answer: kk ? `Жұмысқа қабылданған күніңіз: ${p.hire_date}.` : `Дата вашего приёма на работу: ${p.hire_date}.`,
        facts: [p.hire_date],
      };
    case "position":
      return { answer: kk ? `Сіздің лауазымыңыз: ${p.position}.` : `Ваша должность: ${p.position}.`, facts: [] };
    case "department":
      return { answer: kk ? `Сіздің бөліміңіз: ${p.department}.` : `Ваше подразделение: ${p.department}.`, facts: [] };
    case "company":
      return { answer: kk ? `Сіз ${p.company} компаниясында жұмыс істейсіз.` : `Вы работаете в ${p.company}.`, facts: [] };
  }
}
