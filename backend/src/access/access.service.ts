import { Global, Injectable, Module } from "@nestjs/common";
import type { Prisma, Request } from "@prisma/client";
import type { AuthUser } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Data-scope rules from SPEC §3, in one place:
 *  - everyone sees their own data;
 *  - a manager sees direct reports only;
 *  - HR sees everyone.
 * Role checks alone are not enough: every endpoint also checks the resource belongs to that scope.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async isManagerOf(me: AuthUser, employeeId: number): Promise<boolean> {
    if (me.role !== "manager") return false;
    const e = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { manager_id: true } });
    return e?.manager_id === me.employee_id;
  }

  async canSeeEmployee(me: AuthUser, employeeId: number): Promise<boolean> {
    return me.employee_id === employeeId || me.role === "hr" || (await this.isManagerOf(me, employeeId));
  }

  /** Employee ids in my "team" scope: direct reports for a manager, everyone but me for HR. */
  async teamEmployeeIds(me: AuthUser): Promise<number[]> {
    if (me.role === "employee") return [];
    const where = me.role === "hr" ? { id: { not: me.employee_id } } : { manager_id: me.employee_id };
    const rows = await this.prisma.employee.findMany({ where, select: { id: true }, orderBy: { id: "asc" } });
    return rows.map((r) => r.id);
  }

  /**
   * User ids allowed to move the request to its next status. Stage 1 (submitted) belongs to the
   * author's manager; if that manager has no platform account, HR takes it. Stage 2 is HR's.
   * The author is never their own approver.
   */
  async approverUserIds(r: Pick<Request, "status" | "employee_id">): Promise<number[]> {
    let ids: number[] = [];
    if (r.status === "submitted") {
      const author = await this.prisma.employee.findUnique({
        where: { id: r.employee_id },
        select: { manager: { select: { user: { select: { id: true, role: true } } } } },
      });
      const managerUser = author?.manager?.user;
      ids = managerUser && managerUser.role !== "employee" ? [managerUser.id] : await this.hrUserIds();
    } else if (r.status === "manager_approved") {
      ids = await this.hrUserIds();
    }
    const authorUser = await this.prisma.user.findUnique({ where: { employee_id: r.employee_id }, select: { id: true } });
    return ids.filter((id) => id !== authorUser?.id);
  }

  /**
   * Pending requests waiting on `me` — the same rule as approverUserIds, expressed as one query
   * (used for the dashboard task list). Keep the two in sync.
   */
  pendingApprovalsWhere(me: AuthUser): Prisma.RequestWhereInput | null {
    if (me.role === "employee") return null;
    const or: Prisma.RequestWhereInput[] = [{ status: "submitted", employee: { manager_id: me.employee_id } }];
    if (me.role === "hr") {
      or.push({ status: "manager_approved" });
      // Stage 1 falls to HR when the author's manager has no (non-employee) account.
      or.push({
        status: "submitted",
        employee: {
          OR: [
            { manager_id: null },
            { manager: { is: { user: { is: null } } } },
            { manager: { is: { user: { is: { role: "employee" } } } } },
          ],
        },
      });
    }
    return { employee_id: { not: me.employee_id }, OR: or };
  }

  async hrUserIds(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({ where: { role: "hr" }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async userIdOfEmployee(employeeId: number): Promise<number | null> {
    const u = await this.prisma.user.findUnique({ where: { employee_id: employeeId }, select: { id: true } });
    return u?.id ?? null;
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
