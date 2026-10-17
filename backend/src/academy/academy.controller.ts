import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseIntPipe, Post } from "@nestjs/common";
import type { Enrollment, Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsPositive, Matches, Min } from "class-validator";
import { AccessService } from "../access/access.service";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { forbidden, invalid, notFound } from "../common/errors";
import { dayOffset, fmtDate, fromDateOnly, isValidIsoDate } from "../common/format";
import { courseView, ENROLLMENT_INCLUDE, enrollmentView, lessonView, quizQuestionView } from "../common/views";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const PASS_SCORE = 70;

class QuizDto {
  @IsArray({ message: "answers должен быть массивом" })
  @ArrayMaxSize(100)
  @IsInt({ each: true, message: "Ответы — индексы вариантов" })
  @Min(0, { each: true })
  answers: number[];
}

class AssignDto {
  @Type(() => Number) @IsInt() @IsPositive() employee_id: number;
  @Type(() => Number) @IsInt() @IsPositive() course_id: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Срок: ГГГГ-ММ-ДД" }) due_date?: string | null;
}

@Injectable()
export class AcademyService {
  constructor(private prisma: PrismaService, private access: AccessService, private notifications: NotificationsService) {}

  async courses() {
    return (await this.prisma.course.findMany({ orderBy: { id: "asc" } })).map(courseView);
  }

  async myEnrollments(me: AuthUser) {
    const rows = await this.prisma.enrollment.findMany({ where: { employee_id: me.employee_id }, include: ENROLLMENT_INCLUDE, orderBy: { id: "asc" } });
    return rows.map(enrollmentView);
  }

  async course(me: AuthUser, id: number) {
    const c = await this.prisma.course.findUnique({
      where: { id },
      include: { lessons: { orderBy: { order: "asc" } }, questions: { orderBy: { id: "asc" } } },
    });
    if (!c) throw notFound("Курс не найден");
    const e = await this.prisma.enrollment.findUnique({
      where: { employee_id_course_id: { employee_id: me.employee_id, course_id: id } },
      include: ENROLLMENT_INCLUDE,
    });
    return { ...courseView(c), lessons: c.lessons.map(lessonView), quiz: c.questions.map(quizQuestionView), enrollment: e ? enrollmentView(e) : null };
  }

  async completeLesson(me: AuthUser, enrollmentId: number, lessonId: number) {
    const e = await this.ownEnrollment(me, enrollmentId);
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, course_id: e.course_id } });
    if (!lesson) throw notFound("Урок не найден");

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonProgress.upsert({
        where: { enrollment_id_lesson_id: { enrollment_id: e.id, lesson_id: lessonId } },
        create: { enrollment_id: e.id, lesson_id: lessonId },
        update: {},
      });
      await this.recalc(tx, { ...e, status: e.status === "assigned" ? "in_progress" : e.status });
    });
    return this.view(e.id);
  }

  async submitQuiz(me: AuthUser, enrollmentId: number, answers: number[]) {
    const e = await this.ownEnrollment(me, enrollmentId);
    const [questions, lessonsTotal, lessonsDone] = await Promise.all([
      this.prisma.quizQuestion.findMany({ where: { course_id: e.course_id }, orderBy: { id: "asc" } }),
      this.prisma.lesson.count({ where: { course_id: e.course_id } }),
      this.prisma.lessonProgress.count({ where: { enrollment_id: e.id } }),
    ]);
    if (lessonsDone < lessonsTotal) throw invalid("Сначала изучите все уроки курса");
    if (answers.length !== questions.length) throw invalid("Ответьте на все вопросы");

    const correct = questions.map((q) => q.correct_index);
    const right = questions.filter((q, i) => answers[i] === q.correct_index).length;
    const score = questions.length ? Math.round((right / questions.length) * 100) : 100;
    const passed = score >= PASS_SCORE;
    const justCompleted = passed && e.status !== "completed";

    await this.prisma.$transaction(async (tx) => {
      const next: Enrollment = {
        ...e,
        score: Math.max(e.score ?? 0, score), // retakes keep the best result
        status: justCompleted ? "completed" : e.status === "assigned" ? "in_progress" : e.status,
        completed_at: justCompleted ? new Date() : e.completed_at,
      };
      await this.recalc(tx, next);

      if (justCompleted) {
        const [course, self] = await Promise.all([
          tx.course.findUniqueOrThrow({ where: { id: e.course_id } }),
          tx.employee.findUniqueOrThrow({ where: { id: me.employee_id } }),
        ]);
        await this.notifications.send([me.id], {
          type: "course_completed",
          title: "Курс пройден",
          body: `«${course.title}» — результат ${score}%. Отметка добавлена в профиль.`,
          link: `/academy/${course.id}`,
        }, tx);
        if (e.assigned_by) {
          const assigner = await this.access.userIdOfEmployee(e.assigned_by);
          if (assigner && assigner !== me.id) {
            await this.notifications.send([assigner], {
              type: "course_completed",
              title: "Сотрудник прошёл курс",
              body: `${self.full_name} · «${course.title}» · ${score}%`,
              link: `/team/${me.employee_id}`,
            }, tx);
          }
        }
      }
    });
    return { score, passed, correct };
  }

  /** Managers assign to their team, HR to anyone, and anyone may enroll themselves from the catalog. */
  async assign(me: AuthUser, dto: AssignDto) {
    const course = await this.prisma.course.findUnique({ where: { id: dto.course_id } });
    if (!course) throw notFound("Курс не найден");
    if (!(await this.prisma.employee.count({ where: { id: dto.employee_id } }))) throw notFound("Сотрудник не найден");

    const self = dto.employee_id === me.employee_id;
    if (!self && me.role !== "hr" && !(await this.access.isManagerOf(me, dto.employee_id))) {
      throw forbidden("Назначать курсы можно только своей команде");
    }
    const due = dto.due_date || null;
    if (due && (!isValidIsoDate(due) || due < dayOffset(0))) throw invalid("Срок не может быть в прошлом");

    const existing = await this.prisma.enrollment.findUnique({
      where: { employee_id_course_id: { employee_id: dto.employee_id, course_id: dto.course_id } },
    });
    if (existing) {
      if (self) return this.view(existing.id);
      throw invalid("Курс уже назначен этому сотруднику", "already_assigned");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const e = await tx.enrollment.create({
        data: {
          employee_id: dto.employee_id,
          course_id: dto.course_id,
          assigned_by: self ? null : me.employee_id,
          due_date: due ? fromDateOnly(due) : null,
        },
      });
      if (!self) {
        const [target, assigner] = await Promise.all([
          this.access.userIdOfEmployee(dto.employee_id),
          tx.employee.findUniqueOrThrow({ where: { id: me.employee_id }, select: { full_name: true } }),
        ]);
        if (target) {
          await this.notifications.send([target], {
            type: "course_assigned",
            title: "Назначен курс",
            body: `«${course.title}»${due ? ` — пройти до ${fmtDate(due)}` : ""}. Назначил(а): ${assigner.full_name}.`,
            link: `/academy/${course.id}`,
          }, tx);
        }
      }
      return e;
    });
    return this.view(created.id);
  }

  // ---------- internals ----------

  private async ownEnrollment(me: AuthUser, id: number) {
    const e = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!e) throw notFound("Назначение не найдено");
    if (e.employee_id !== me.employee_id) throw forbidden("Это обучение назначено другому сотруднику");
    return e;
  }

  /** Progress = lessons done + passed quiz, out of lessons + 1 (the quiz counts as a step). */
  private async recalc(tx: Prisma.TransactionClient, e: Enrollment) {
    const [total, done] = await Promise.all([
      tx.lesson.count({ where: { course_id: e.course_id } }),
      tx.lessonProgress.count({ where: { enrollment_id: e.id } }),
    ]);
    const steps = done + (e.status === "completed" ? 1 : 0);
    const progress_pct = Math.min(100, Math.round((steps / (total + 1)) * 100));
    await tx.enrollment.update({
      where: { id: e.id },
      data: { status: e.status, score: e.score, completed_at: e.completed_at, progress_pct },
    });
  }

  private async view(id: number) {
    return enrollmentView(await this.prisma.enrollment.findUniqueOrThrow({ where: { id }, include: ENROLLMENT_INCLUDE }));
  }
}

@Controller()
export class AcademyController {
  constructor(private svc: AcademyService) {}

  @Get("courses")
  courses() {
    return this.svc.courses();
  }

  @Get("courses/:id")
  course(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.svc.course(me, id);
  }

  @Get("enrollments/mine")
  mine(@CurrentUser() me: AuthUser) {
    return this.svc.myEnrollments(me);
  }

  @Post("enrollments")
  assign(@CurrentUser() me: AuthUser, @Body() body: AssignDto) {
    return this.svc.assign(me, body);
  }

  @Post("enrollments/:id/lessons/:lessonId/complete")
  @HttpCode(200)
  completeLesson(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number, @Param("lessonId", ParseIntPipe) lessonId: number) {
    return this.svc.completeLesson(me, id, lessonId);
  }

  @Post("enrollments/:id/quiz")
  @HttpCode(200)
  quiz(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() body: QuizDto) {
    return this.svc.submitQuiz(me, id, body.answers);
  }
}

@Module({ controllers: [AcademyController], providers: [AcademyService] })
export class AcademyModule {}
