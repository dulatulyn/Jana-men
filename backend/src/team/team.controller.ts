import { Controller, Get, Injectable, Module, Param, ParseIntPipe, Query } from "@nestjs/common";
import type { Enrollment, Prisma, RequestStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsPositive, Matches } from "class-validator";
import { AccessService } from "../access/access.service";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { forbidden, invalid, notFound } from "../common/errors";
import { addDays, dayOffset, daysBetween, isValidIsoDate, toDateOnly } from "../common/format";
import { ENROLLMENT_INCLUDE, enrollmentView, personRef, requestListItemView, type VacationPayload } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

const ACTIVE: RequestStatus[] = ["submitted", "manager_approved", "approved"];
const MAX_CALENDAR_DAYS = 400;
const DEFAULT_SPAN_DAYS = 121;
const EMPLOYEE_REQUESTS_LIMIT = 20;
const EMPLOYEE_REF = { employee: { select: { id: true, full_name: true } } } as const;

class CalendarQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from: ГГГГ-ММ-ДД" }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to: ГГГГ-ММ-ДД" }) to?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "department_id: целое число" })
  @IsPositive({ message: "department_id: целое число" })
  department_id?: number;
}

type Vacation = { start_date: string; end_date: string; status: RequestStatus };

const byStart = (a: Vacation, b: Vacation) => a.start_date.localeCompare(b.start_date);

function vacationState(list: Vacation[], today: string) {
  const current = list.filter((v) => v.status === "approved" && v.start_date <= today && today <= v.end_date).sort(byStart)[0] ?? null;
  const next = list.filter((v) => v !== current && v.start_date >= today).sort(byStart)[0] ?? null;
  return {
    on_vacation: current ? { start_date: current.start_date, end_date: current.end_date } : null,
    next_vacation: next ? { start_date: next.start_date, end_date: next.end_date, status: next.status } : null,
  };
}

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  /** Short profile only — no phone or 1С id (SPEC §3: "краткий профиль, без лишних ПД"). */
  private async members(me: AuthUser, ids: number[]) {
    const today = dayOffset(0);
    const pendingWhere = this.access.pendingApprovalsWhere(me);
    const [rows, vacations, pending] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: ids } },
        include: { department: true, enrollments: { include: ENROLLMENT_INCLUDE, orderBy: { id: "asc" } } },
        orderBy: { full_name: "asc" },
      }),
      this.prisma.request.findMany({
        where: { employee_id: { in: ids }, type: "vacation", status: { in: ACTIVE } },
        select: { employee_id: true, status: true, payload: true },
      }),
      pendingWhere
        ? this.prisma.request.findMany({ where: { AND: [pendingWhere, { employee_id: { in: ids } }] }, select: { employee_id: true } })
        : Promise.resolve([] as { employee_id: number }[]),
    ]);
    return rows.map((e) => ({
      id: e.id,
      full_name: e.full_name,
      position: e.position,
      department: e.department.name,
      department_id: e.department_id,
      work_type: e.work_type,
      hire_date: toDateOnly(e.hire_date),
      vacation_balance_days: e.vacation_balance_days,
      enrollments: e.enrollments.map(enrollmentView),
      pending_requests: pending.filter((p) => p.employee_id === e.id).length,
      ...vacationState(
        vacations
          .filter((v) => v.employee_id === e.id)
          .map((v) => {
            const p = v.payload as VacationPayload;
            return { start_date: p.start_date, end_date: p.end_date, status: v.status };
          }),
        today,
      ),
    }));
  }

  async team(me: AuthUser) {
    return this.members(me, await this.access.teamEmployeeIds(me));
  }

  async employee(me: AuthUser, id: number) {
    const exists = await this.prisma.employee.count({ where: { id } });
    if (!exists) throw notFound("Сотрудник не найден");
    if (!(await this.access.canSeeEmployee(me, id))) throw forbidden("Сотрудник не входит в вашу команду");
    const [[member], requests] = await Promise.all([
      this.members(me, [id]),
      this.prisma.request.findMany({
        where: { employee_id: id },
        include: EMPLOYEE_REF,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: EMPLOYEE_REQUESTS_LIMIT,
      }),
    ]);
    return { ...member, requests: requests.map(requestListItemView) };
  }

  private range(from?: string, to?: string) {
    if (!from && !to) return { from: dayOffset(-30), to: dayOffset(90) };
    if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) throw invalid("Некорректная дата");
    const start = from ?? addDays(to!, -(DEFAULT_SPAN_DAYS - 1));
    const end = to ?? addDays(from!, DEFAULT_SPAN_DAYS - 1);
    if (start > end) throw invalid("from позже to");
    if (daysBetween(start, end) > MAX_CALENDAR_DAYS) {
      throw invalid(`Период календаря — не больше ${MAX_CALENDAR_DAYS} дней`, "range_too_large");
    }
    return { from: start, to: end };
  }

  async calendar(me: AuthUser, q: CalendarQuery) {
    const { from, to } = this.range(q.from, q.to);
    const employee: Prisma.EmployeeWhereInput = {};
    if (q.department_id !== undefined) {
      if (me.role === "hr") {
        if (!(await this.prisma.department.count({ where: { id: q.department_id } }))) throw notFound("Отдел не найден");
      } else {
        const self = await this.prisma.employee.findUniqueOrThrow({ where: { id: me.employee_id }, select: { department_id: true } });
        if (self.department_id !== q.department_id) throw forbidden("Календарь другого отдела недоступен");
      }
      employee.department_id = q.department_id;
    }
    if (me.role !== "hr") employee.id = { in: [...(await this.access.teamEmployeeIds(me)), me.employee_id] };
    const rows = await this.prisma.request.findMany({
      where: { type: "vacation", status: { in: ACTIVE }, ...(Object.keys(employee).length ? { employee } : {}) },
      include: EMPLOYEE_REF,
      orderBy: { created_at: "asc" },
    });
    return rows
      .map((r) => ({ r, p: r.payload as VacationPayload }))
      .filter(({ p }) => p.start_date <= to && p.end_date >= from)
      .sort((a, b) => a.p.start_date.localeCompare(b.p.start_date))
      .map(({ r, p }) => ({ employee: personRef(r.employee), start_date: p.start_date, end_date: p.end_date, status: r.status }));
  }

  async academy(me: AuthUser) {
    const ids = await this.access.teamEmployeeIds(me);
    const today = dayOffset(0);
    const [courses, people, enrollments] = await Promise.all([
      this.prisma.course.findMany({ orderBy: { id: "asc" } }),
      this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true }, orderBy: { full_name: "asc" } }),
      this.prisma.enrollment.findMany({
        where: { employee_id: { in: ids } },
        include: EMPLOYEE_REF,
        orderBy: [{ employee: { full_name: "asc" } }, { id: "asc" }],
      }),
    ]);
    const overdue = (e: Enrollment) => e.status !== "completed" && e.due_date !== null && toDateOnly(e.due_date)! < today;
    return courses.map((c) => {
      const list = enrollments.filter((e) => e.course_id === c.id);
      const enrolled = new Set(list.map((e) => e.employee_id));
      return {
        course: { id: c.id, title: c.title, cover: c.cover, duration_min: c.duration_min },
        assigned: list.length,
        completed: list.filter((e) => e.status === "completed").length,
        in_progress: list.filter((e) => e.status === "in_progress").length,
        not_started: list.filter((e) => e.status === "assigned").length,
        overdue: list.filter(overdue).length,
        members: list.map((e) => ({
          employee: personRef(e.employee),
          enrollment_id: e.id,
          status: e.status,
          progress: e.progress_pct,
          due_date: toDateOnly(e.due_date),
          overdue: overdue(e),
          score: e.score,
          completed_at: e.completed_at,
        })),
        unassigned: people.filter((p) => !enrolled.has(p.id)).map(personRef),
      };
    });
  }
}

@Controller()
export class TeamController {
  constructor(private svc: TeamService) {}

  @Get("team")
  @Roles("manager", "hr")
  team(@CurrentUser() me: AuthUser) {
    return this.svc.team(me);
  }

  @Get("team/calendar")
  @Roles("manager", "hr")
  calendar(@CurrentUser() me: AuthUser, @Query() q: CalendarQuery) {
    return this.svc.calendar(me, q);
  }

  @Get("team/academy")
  @Roles("manager", "hr")
  academy(@CurrentUser() me: AuthUser) {
    return this.svc.academy(me);
  }

  @Get("employees/:id")
  employee(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.svc.employee(me, id);
  }
}

@Module({ controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
