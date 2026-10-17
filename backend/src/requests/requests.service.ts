import { Injectable, Logger } from "@nestjs/common";
import type { Prisma, Request, RequestStatus } from "@prisma/client";
import { AccessService } from "../access/access.service";
import type { AuthUser } from "../auth/auth.decorators";
import { conflict, forbidden, invalid, notFound } from "../common/errors";
import { dayOffset, daysBetween, fmtMoney, isValidIsoDate } from "../common/format";
import {
  eventView, requestListItemView, requestSummary, requestTypeHuman, requestView,
  type AdvancePayload, type VacationPayload,
} from "../common/views";
import { IntegrationsService } from "../integrations/integrations.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRequestDto } from "./requests.dto";

const EMPLOYEE_REF = { employee: { select: { id: true, full_name: true } } } as const;
const PENDING: RequestStatus[] = ["submitted", "manager_approved"];
const ACTIVE: RequestStatus[] = ["submitted", "manager_approved", "approved"];
const MAX_ADVANCE = 1_000_000;

/**
 * Request lifecycle (SPEC §4):
 *   submitted ──manager──▶ manager_approved ──HR──▶ approved ──▶ 1С:ЗУП + Documentolog
 *   submitted | manager_approved ──reject──▶ rejected
 *   submitted ──author──▶ cancelled
 */
@Injectable()
export class RequestsService {
  private readonly logger = new Logger("Requests");

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
    private integrations: IntegrationsService,
  ) {}

  async list(me: AuthUser, scope: "mine" | "team" | "all" = "mine", status?: RequestStatus | "") {
    let where: Prisma.RequestWhereInput;
    if (scope === "mine") {
      where = { employee_id: me.employee_id };
    } else if (scope === "team") {
      if (me.role === "employee") throw forbidden("Раздел доступен руководителю и HR");
      where = me.role === "hr"
        ? { employee_id: { not: me.employee_id } }
        : { employee: { manager_id: me.employee_id } };
    } else {
      if (me.role !== "hr") throw forbidden("Все заявки доступны только HR");
      where = {};
    }
    if (status) where = { ...where, status };
    const rows = await this.prisma.request.findMany({ where, include: EMPLOYEE_REF, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    return rows.map(requestListItemView);
  }

  async get(me: AuthUser, id: number) {
    const r = await this.loadVisible(me, id);
    const events = await this.prisma.requestEvent.findMany({
      where: { request_id: id },
      include: { actor: { select: { id: true, full_name: true } } },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return { ...requestView(r), events: events.map(eventView) };
  }

  async create(me: AuthUser, dto: CreateRequestDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize submissions per employee so two concurrent requests can't spend the same days.
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${me.employee_id} FOR UPDATE`;
      const employee = await tx.employee.findUniqueOrThrow({ where: { id: me.employee_id } });

      const payload = dto.type === "vacation"
        ? await this.validateVacation(tx, me.employee_id, employee.vacation_balance_days, dto.payload)
        : this.validateAdvance(dto.payload);

      const r = await tx.request.create({
        data: { employee_id: me.employee_id, type: dto.type, payload, status: "submitted" },
        include: EMPLOYEE_REF,
      });
      await tx.requestEvent.create({ data: { request_id: r.id, actor_id: me.employee_id, from_status: null, to_status: "submitted" } });

      const approvers = await this.access.approverUserIds(r);
      await this.notifications.send([me.id], {
        type: "request_submitted",
        title: `Заявка №${r.id} отправлена`,
        body: approvers.length ? "Ждёт согласования руководителя." : "",
        link: `/requests/${r.id}`,
      }, tx);
      await this.notifications.send(approvers, {
        type: "request_submitted",
        title: `Новая заявка: ${requestTypeHuman(r)}`,
        body: `${employee.full_name} · ${requestSummary(r)}`,
        link: `/requests/${r.id}`,
      }, tx);
      return r;
    });
    return requestView(created);
  }

  async approve(me: AuthUser, id: number, comment?: string) {
    const r = await this.loadActionable(me, id, "Согласовать");
    const c = comment?.trim() || null;
    const authorUserId = await this.access.userIdOfEmployee(r.employee_id);

    if (r.status === "submitted") {
      await this.prisma.$transaction(async (tx) => {
        await this.transition(tx, r, "manager_approved", me.employee_id, c);
        if (authorUserId) {
          await this.notifications.send([authorUserId], {
            type: "request_manager_approved",
            title: `Руководитель согласовал ${requestTypeHuman(r)}`,
            body: "Заявка передана в HR на проведение.",
            link: `/requests/${r.id}`,
          }, tx);
        }
        const hr = (await this.access.hrUserIds()).filter((u) => u !== me.id && u !== authorUserId);
        await this.notifications.send(hr, {
          type: "request_manager_approved",
          title: "Заявка ждёт HR",
          body: `${r.employee.full_name} · ${requestTypeHuman(r)} согласован руководителем.`,
          link: `/requests/${r.id}`,
        }, tx);
      });
      return this.reload(id);
    }

    // Final HR approval. Commit the status first, then talk to external systems:
    // a 1С/Documentolog outage must not roll back an approval.
    await this.prisma.$transaction((tx) => this.transition(tx, r, "approved", me.employee_id, c));

    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: r.employee_id } });
    const res = await this.integrations.provisionApproved(r, employee);

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({ where: { id }, data: { external_1c_id: res.external_1c_id, docflow_id: res.docflow_id } });
      if (res.vacation_balance_days != null) {
        await tx.employee.update({ where: { id: r.employee_id }, data: { vacation_balance_days: res.vacation_balance_days } });
      }
      if (authorUserId) {
        await this.notifications.send([authorUserId], {
          type: "request_approved",
          title: r.type === "vacation" ? "Отпуск одобрен" : "Аванс одобрен",
          body: res.errors.length
            ? "Заявка одобрена. Проведение в учётных системах выполнит HR."
            : `Проведено в 1С:ЗУП, заявление ${res.docflow_id} отправлено на подпись.`,
          link: `/requests/${r.id}`,
        }, tx);
      }
      if (res.errors.length) {
        await this.notifications.send(await this.access.hrUserIds(), {
          type: "integration_error",
          title: `Заявка №${r.id}: ошибка проведения`,
          body: res.errors.join("; "),
          link: "/hr",
        }, tx);
      }
    });
    return this.reload(id);
  }

  async reject(me: AuthUser, id: number, comment?: string) {
    const r = await this.loadActionable(me, id, "Отклонить");
    const c = comment?.trim();
    if (!c) throw invalid("Укажите причину отказа");
    const authorUserId = await this.access.userIdOfEmployee(r.employee_id);
    const actor = await this.prisma.employee.findUniqueOrThrow({ where: { id: me.employee_id }, select: { full_name: true } });

    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, r, "rejected", me.employee_id, c);
      if (authorUserId) {
        await this.notifications.send([authorUserId], {
          type: "request_rejected",
          title: `Заявка на ${requestTypeHuman(r)} отклонена`,
          body: `${actor.full_name}: ${c}`,
          link: `/requests/${r.id}`,
        }, tx);
      }
    });
    return this.reload(id);
  }

  async cancel(me: AuthUser, id: number) {
    const r = await this.loadVisible(me, id);
    if (r.employee_id !== me.employee_id) throw forbidden("Отменить можно только свою заявку");
    if (r.status !== "submitted") throw conflict("Отменить можно только заявку, которую ещё не согласовали");
    const approvers = await this.access.approverUserIds(r);

    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, r, "cancelled", me.employee_id, null);
      await this.notifications.send(approvers, {
        type: "request_cancelled",
        title: "Заявка отменена",
        body: `${r.employee.full_name} отменил(а) заявку №${r.id}.`,
        link: `/requests/${r.id}`,
      }, tx);
    });
    return this.reload(id);
  }

  // ---------- internals ----------

  /** Compare-and-set on status: if someone else moved the request first, this fails with 409. */
  private async transition(tx: Prisma.TransactionClient, r: Request, to: RequestStatus, actorEmployeeId: number, comment: string | null) {
    const res = await tx.request.updateMany({ where: { id: r.id, status: r.status }, data: { status: to } });
    if (res.count !== 1) throw conflict("Заявка уже обработана");
    await tx.requestEvent.create({ data: { request_id: r.id, actor_id: actorEmployeeId, from_status: r.status, to_status: to, comment } });
  }

  private async loadVisible(me: AuthUser, id: number) {
    const r = await this.prisma.request.findUnique({ where: { id }, include: EMPLOYEE_REF });
    if (!r) throw notFound("Заявка не найдена");
    if (!(await this.access.canSeeEmployee(me, r.employee_id))) throw forbidden("Заявка сотрудника не из вашей команды");
    return r;
  }

  /** Loads a request that `me` is about to approve/reject, enforcing stage and approver rules. */
  private async loadActionable(me: AuthUser, id: number, verb: string) {
    const r = await this.loadVisible(me, id);
    if (!PENDING.includes(r.status)) throw conflict("Заявка уже обработана");
    if (r.employee_id === me.employee_id) throw forbidden(`Нельзя ${verb.toLowerCase()} собственную заявку`);
    if (!(await this.access.approverUserIds(r)).includes(me.id)) throw forbidden(`${verb} эту заявку может другой сотрудник`);
    return r;
  }

  private async reload(id: number) {
    return requestView(await this.prisma.request.findUniqueOrThrow({ where: { id }, include: EMPLOYEE_REF }));
  }

  private async validateVacation(tx: Prisma.TransactionClient, employeeId: number, balance: number, p: Record<string, unknown>): Promise<VacationPayload> {
    const { start_date, end_date } = p;
    if (!start_date || !end_date) throw invalid("Укажите даты отпуска");
    if (!isValidIsoDate(start_date) || !isValidIsoDate(end_date)) throw invalid("Даты должны быть в формате ГГГГ-ММ-ДД");
    if (start_date < dayOffset(0)) throw invalid("Дата начала не может быть в прошлом", "past_date");
    if (end_date < start_date) throw invalid("Дата окончания раньше даты начала");
    const comment = typeof p.comment === "string" ? p.comment.trim() : "";
    if (comment.length > 500) throw invalid("Комментарий слишком длинный");

    // Days are always computed here; a client-sent `days` is ignored.
    const days = daysBetween(start_date, end_date);

    const own = await tx.request.findMany({ where: { employee_id: employeeId, type: "vacation", status: { in: ACTIVE } } });
    const reserved = own
      .filter((r) => r.status !== "approved") // approved days are already deducted from the 1С balance
      .reduce((sum, r) => sum + (r.payload as VacationPayload).days, 0);
    const available = balance - reserved;
    if (days > available) {
      const pending = reserved ? ` (ещё ${reserved} дн. в заявках на согласовании)` : "";
      throw invalid(`Недостаточно дней отпуска: доступно ${Math.max(0, available)}, запрошено ${days}${pending}`, "insufficient_balance");
    }
    const overlap = own.some((r) => {
      const q = r.payload as VacationPayload;
      return q.start_date <= end_date && start_date <= q.end_date;
    });
    if (overlap) throw invalid("Даты пересекаются с другой вашей заявкой на отпуск", "overlap");

    return { start_date, end_date, days, comment };
  }

  private validateAdvance(p: Record<string, unknown>): AdvancePayload {
    const amount = Math.round(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw invalid("Укажите сумму аванса");
    if (amount > MAX_ADVANCE) throw invalid(`Сумма аванса не может превышать ${fmtMoney(MAX_ADVANCE)}`);
    const reason = typeof p.reason === "string" ? p.reason.trim() : "";
    if (!reason) throw invalid("Укажите причину");
    if (reason.length > 500) throw invalid("Причина слишком длинная");
    return { amount, reason };
  }
}
