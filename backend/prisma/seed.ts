/* Seeds demo data. Idempotent: does nothing if the DB already has users, unless run with --force
 * (or SEED_FORCE=1), which wipes all tables first. `npm run db:reset` = migrate reset + seed. */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import kbData from "./kb-data.json";
import * as d from "./seed-data";

const TABLES = [
  "lesson_progress", "enrollments", "quiz_questions", "lessons", "courses",
  "request_events", "requests", "notifications", "assistant_logs", "integration_log",
  "kb_articles", "users", "departments", "employees",
];

// Tables seeded with explicit ids: move their sequences past the max id.
const SEQUENCED = ["employees", "departments", "users", "requests", "courses", "lessons", "quiz_questions", "enrollments"];

/** Returns false if skipped because data already exists. Also used by the e2e tests to reset state. */
export async function seedDatabase(prisma: PrismaClient, { force = false } = {}): Promise<boolean> {
  if (!force && (await prisma.user.count()) > 0) return false;

  const passwordHash = await bcrypt.hash(d.DEMO_PASSWORD, 10);
  const kbTitles = Object.fromEntries(kbData.map((a) => [a.slug, a.title]));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

    // departments.head_id → employees and employees.department_id → departments form a cycle:
    // insert both without the back-references, then wire heads and managers.
    await tx.department.createMany({ data: d.departments.map((dep) => ({ ...dep, head_id: null })) });
    await tx.employee.createMany({ data: d.employees.map((e) => ({ ...e, manager_id: null })) });
    for (const dep of d.departments) {
      await tx.department.update({ where: { id: dep.id }, data: { head_id: dep.head_id } });
    }
    for (const e of d.employees) {
      if (e.manager_id != null) await tx.employee.update({ where: { id: e.id }, data: { manager_id: e.manager_id } });
    }

    await tx.user.createMany({
      data: d.users.map((u) => ({ id: u.id, email: `${u.login}@jana.demo`, password_hash: passwordHash, employee_id: u.employee_id, role: u.role, locale: "ru" as const })),
    });

    await tx.request.createMany({ data: d.requests });
    await tx.requestEvent.createMany({ data: d.events });

    await tx.course.createMany({ data: d.courses });
    await tx.lesson.createMany({ data: d.lessons });
    await tx.quizQuestion.createMany({ data: d.questions });
    await tx.enrollment.createMany({ data: d.enrollments });
    await tx.lessonProgress.createMany({ data: d.lessonProgress });

    await tx.notification.createMany({
      data: d.notifications.map(({ read, ...n }) => ({ ...n, read_at: read ? n.created_at : null })),
    });
    await tx.integrationLog.createMany({ data: d.integrationLog });

    // KB: body_md is stored verbatim — the AI service checks quotes against it character by character.
    await tx.kbArticle.createMany({ data: kbData.map((a) => ({ slug: a.slug, title: a.title, category: a.category, body_md: a.body_md })) });
    await tx.assistantLog.createMany({ data: d.assistantLogs(kbTitles) });

    for (const t of SEQUENCED) {
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), (SELECT MAX(id) FROM "${t}"))`);
    }
  });

  return true;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const force = process.argv.includes("--force") || process.env.SEED_FORCE === "1";
    if (await seedDatabase(prisma, { force })) {
      console.log(`[seed] готово: ${d.employees.length} сотрудников, ${d.users.length} пользователей, ${d.requests.length} заявок, ${kbData.length} статей БЗ. Пароль: ${d.DEMO_PASSWORD}`);
    } else {
      console.log("[seed] база уже заполнена — пропускаю (--force для пересоздания)");
    }
  } catch (e) {
    console.error("[seed] ошибка:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
