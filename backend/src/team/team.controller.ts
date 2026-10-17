import { Controller, Get, Injectable, Module, Param, ParseIntPipe, Query } from "@nestjs/common";
import { IsOptional, Matches } from "class-validator";
import { AccessService } from "../access/access.service";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { forbidden, invalid, notFound } from "../common/errors";
import { dayOffset, isValidIsoDate, toDateOnly } from "../common/format";
import { ENROLLMENT_INCLUDE, enrollmentView, personRef, type VacationPayload } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

class CalendarQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from: ГГГГ-ММ-ДД" }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to: ГГГГ-ММ-ДД" }) to?: string;
}

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  /** Short profile only — no phone or 1С id (SPEC §3: "краткий профиль, без лишних ПД"). */
  private async members(ids: number[]) {
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      include: { department: true, enrollments: { include: ENROLLMENT_INCLUDE, orderBy: { id: "asc" } } },
      orderBy: { full_name: "asc" },
    });
    return rows.map((e) => ({
      id: e.id,
      full_name: e.full_name,
      position: e.position,
      department: e.department.name,
      work_type: e.work_type,
      hire_date: toDateOnly(e.hire_date),
      vacation_balance_days: e.vacation_balance_days,
      enrollments: e.enrollments.map(enrollmentView),
    }));
  }

  async team(me: AuthUser) {
    return this.members(await this.access.teamEmployeeIds(me));
  }

  async employee(me: AuthUser, id: number) {
    const exists = await this.prisma.employee.count({ where: { id } });
    if (!exists) throw notFound("Сотрудник не найден");
    if (!(await this.access.canSeeEmployee(me, id))) throw forbidden("Сотрудник не входит в вашу команду");
    return (await this.members([id]))[0];
  }

  async calendar(me: AuthUser, from = dayOffset(-30), to = dayOffset(90)) {
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw invalid("Некорректная дата");
    if (from > to) throw invalid("from позже to");
    const scope = me.role === "hr" ? {} : { employee_id: { in: [...(await this.access.teamEmployeeIds(me)), me.employee_id] } };
    const rows = await this.prisma.request.findMany({
      where: { type: "vacation", status: { in: ["submitted", "manager_approved", "approved"] }, ...scope },
      include: { employee: { select: { id: true, full_name: true } } },
      orderBy: { created_at: "asc" },
    });
    return rows
      .map((r) => ({ r, p: r.payload as VacationPayload }))
      .filter(({ p }) => p.start_date <= to && p.end_date >= from)
      .sort((a, b) => a.p.start_date.localeCompare(b.p.start_date))
      .map(({ r, p }) => ({ employee: personRef(r.employee), start_date: p.start_date, end_date: p.end_date, status: r.status }));
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
    return this.svc.calendar(me, q.from, q.to);
  }

  @Get("employees/:id")
  employee(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.svc.employee(me, id);
  }
}

@Module({ controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
