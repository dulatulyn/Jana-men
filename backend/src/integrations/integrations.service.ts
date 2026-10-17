import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Employee, IntegrationLog, IntegrationSystem, Request } from "@prisma/client";
import { AccessService } from "../access/access.service";
import { ApiError, conflict, invalid, notFound } from "../common/errors";
import { fromDateOnly, toDateOnly } from "../common/format";
import { integrationLogView, requestSummary, type AdvancePayload, type VacationPayload } from "../common/views";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DOCS_ADAPTER, HRIS_ADAPTER, INTEGRATION_OPTIONS, idempotencyKey,
  type DocsAdapter, type HrisAdapter, type HrisEmployee, type IntegrationOptions,
} from "./adapters";

export interface ProvisionResult {
  external_1c_id: string | null;
  docflow_id: string | null;
  /** Balance reported by 1С after posting a vacation; null if not applicable or the call failed. */
  vacation_balance_days: number | null;
  errors: string[];
}

export class IntegrationTimeoutError extends Error {}

type Target = Pick<Employee, "external_id_1c" | "full_name">;
type Journal = {
  system: IntegrationSystem;
  operation: string;
  request_id?: number | null;
  idempotency_key?: string | null;
  retry_of?: number | null;
};
type JournalRow = IntegrationLog & { request: Pick<Request, "status" | "external_1c_id" | "docflow_id"> | null };

const SYSTEM_LABEL: Record<IntegrationSystem, string> = { c1_zup: "1С:ЗУП", documentolog: "Documentolog" };
const HRIS_OPERATIONS = new Set(["postVacation", "postAdvance"]);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const seconds = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 100) / 10} с` : `${ms} мс`);
const operationKey = (l: IntegrationLog) => `${l.system}:${l.operation}:${l.request_id ?? ""}`;

function resolved(l: JournalRow): boolean {
  if (!l.request || l.request.status !== "approved") return true;
  if (HRIS_OPERATIONS.has(l.operation)) return l.request.external_1c_id !== null;
  if (l.operation === "createDocument") return l.request.docflow_id !== null;
  return true;
}

/** Calls the adapters and writes every call (ok or error) to integration_log. */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger("Integrations");
  private readonly inFlight = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
    @Inject(HRIS_ADAPTER) private hris: HrisAdapter,
    @Inject(DOCS_ADAPTER) private docs: DocsAdapter,
    @Inject(INTEGRATION_OPTIONS) private opts: IntegrationOptions,
  ) {}

  private async withTimeout<T>(system: IntegrationSystem, ms: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new IntegrationTimeoutError(`${SYSTEM_LABEL[system]}: нет ответа за ${seconds(ms)}`));
      }, ms);
    });
    try {
      const pending = call(controller.signal);
      pending.catch(() => undefined);
      return await Promise.race([pending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async journalError(j: Journal, err: unknown, started: number) {
    const details = errorMessage(err).slice(0, 500);
    this.logger.warn(`${j.system}.${j.operation} failed: ${details}`);
    return this.prisma.integrationLog.create({ data: { ...j, status: "error", details, duration_ms: Date.now() - started } });
  }

  private async track<T>(j: Journal, call: (signal: AbortSignal) => Promise<T>, describe: (r: T) => string) {
    const started = Date.now();
    let result: T;
    try {
      result = await this.withTimeout(j.system, this.opts.timeoutMs, call);
    } catch (err) {
      await this.journalError(j, err, started);
      throw err;
    }
    const entry = await this.prisma.integrationLog.create({ data: { ...j, status: "ok", details: describe(result), duration_ms: Date.now() - started } });
    return { result, entry };
  }

  /** Pulls employees from 1С:ЗУП and upserts them by external_id_1c. */
  async syncEmployees() {
    return (await this.runSync(null)).result;
  }

  private async runSync(retryOf: number | null) {
    const j: Journal = { system: "c1_zup", operation: "syncEmployees", retry_of: retryOf };
    const started = Date.now();
    let snapshot: HrisEmployee[];
    try {
      snapshot = await this.withTimeout("c1_zup", this.opts.syncTimeoutMs, (signal) => this.hris.fetchEmployees({ signal }));
    } catch (err) {
      await this.journalError(j, err, started);
      throw new ApiError(502, "integration_error", "1С:ЗУП недоступна, попробуйте позже");
    }
    let changed: number;
    try {
      changed = await this.applySnapshot(snapshot);
    } catch (err) {
      await this.journalError(j, new Error(`Данные 1С:ЗУП не применены: ${errorMessage(err)}`), started);
      throw new ApiError(502, "integration_error", "Данные из 1С:ЗУП не удалось применить, подробности в журнале");
    }
    const details = `Синхронизировано ${snapshot.length} сотрудников, ${changed ? `изменений: ${changed}` : "изменений нет"}`;
    const entry = await this.prisma.integrationLog.create({ data: { ...j, status: "ok", details, duration_ms: Date.now() - started } });
    return { result: { synced: snapshot.length, changed, at: entry.created_at.toISOString() }, entry };
  }

  private applySnapshot(snapshot: HrisEmployee[]): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findMany();
      const byExternal = new Map(existing.map((e) => [e.external_id_1c, e]));
      let changed = 0;
      // Pass 1: create/update scalar fields. Pass 2: managers, once every external id has a row.
      for (const s of snapshot) {
        const data = {
          full_name: s.full_name, company: s.company, position: s.position, department_id: s.department_id,
          hire_date: fromDateOnly(s.hire_date), vacation_balance_days: s.vacation_balance_days, phone: s.phone, work_type: s.work_type,
        };
        const cur = byExternal.get(s.external_id_1c);
        if (!cur) {
          byExternal.set(s.external_id_1c, await tx.employee.create({ data: { external_id_1c: s.external_id_1c, ...data } }));
          changed++;
        } else if (
          cur.full_name !== s.full_name || cur.company !== s.company || cur.position !== s.position ||
          cur.department_id !== s.department_id || toDateOnly(cur.hire_date) !== s.hire_date ||
          cur.vacation_balance_days !== s.vacation_balance_days || cur.phone !== s.phone || cur.work_type !== s.work_type
        ) {
          await tx.employee.update({ where: { id: cur.id }, data });
          changed++;
        }
      }
      for (const s of snapshot) {
        const self = byExternal.get(s.external_id_1c)!;
        const managerId = s.manager_external_id ? byExternal.get(s.manager_external_id)?.id ?? null : null;
        if (self.manager_id !== managerId) {
          await tx.employee.update({ where: { id: self.id }, data: { manager_id: managerId } });
          changed++;
        }
      }
      return changed;
    }, { timeout: this.opts.syncTimeoutMs, maxWait: 10_000 });
  }

  /**
   * After final approval: post to 1С:ЗУП, then create the Documentolog application.
   * Never throws — a failed call is journaled and reported in `errors`, the approval stands.
   */
  async provisionApproved(r: Request, employee: Target): Promise<ProvisionResult> {
    const out: ProvisionResult = { external_1c_id: null, docflow_id: null, vacation_balance_days: null, errors: [] };
    try {
      const res = await this.postToHris(r, employee, null);
      out.external_1c_id = res.external_id;
      out.vacation_balance_days = res.vacation_balance_days;
    } catch (err) {
      out.errors.push(`1С:ЗУП: ${errorMessage(err)}`);
    }
    try {
      out.docflow_id = (await this.createDocument(r, employee, null)).docflow_id;
    } catch (err) {
      out.errors.push(`Documentolog: ${errorMessage(err)}`);
    }
    return out;
  }

  private async postToHris(r: Request, employee: Target, retryOf: number | null) {
    const key = idempotencyKey(r.id);
    const j = { system: "c1_zup" as const, request_id: r.id, idempotency_key: key, retry_of: retryOf };
    const describe = (x: { external_id: string }) => `Заявка №${r.id} → ${x.external_id}`;
    if (r.type === "vacation") {
      const p = r.payload as VacationPayload;
      const { result, entry } = await this.track({ ...j, operation: "postVacation" }, (signal) => this.hris.postVacation({
        request_id: r.id, idempotency_key: key, employee_external_id: employee.external_id_1c,
        start_date: p.start_date, end_date: p.end_date, days: p.days,
      }, { signal }), describe);
      return { external_id: result.external_id, vacation_balance_days: result.vacation_balance_days as number | null, entry };
    }
    const p = r.payload as AdvancePayload;
    const { result, entry } = await this.track({ ...j, operation: "postAdvance" }, (signal) => this.hris.postAdvance({
      request_id: r.id, idempotency_key: key, employee_external_id: employee.external_id_1c, amount: p.amount,
    }, { signal }), describe);
    return { external_id: result.external_id, vacation_balance_days: null, entry };
  }

  private async createDocument(r: Request, employee: Target, retryOf: number | null) {
    const key = idempotencyKey(r.id);
    const { result, entry } = await this.track(
      { system: "documentolog", operation: "createDocument", request_id: r.id, idempotency_key: key, retry_of: retryOf },
      (signal) => this.docs.createDocument({
        request_id: r.id,
        idempotency_key: key,
        kind: r.type === "vacation" ? "vacation_application" : "advance_application",
        employee_full_name: employee.full_name,
        summary: requestSummary(r),
      }, { signal }),
      (x) => `Заявление №${r.id} → ${x.docflow_id}, отправлено на подпись`,
    );
    return { docflow_id: result.docflow_id, entry };
  }

  async journal() {
    const rows: JournalRow[] = await this.prisma.integrationLog.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
      include: { request: { select: { status: true, external_1c_id: true, docflow_id: true } } },
    });
    const seen = new Set<string>();
    return rows.map((row) => {
      const key = operationKey(row);
      const latest = !seen.has(key);
      seen.add(key);
      const retryable = latest && row.status === "error" && (row.operation === "syncEmployees" || !resolved(row));
      return integrationLogView(row, retryable);
    });
  }

  async retry(logId: number) {
    const entry = await this.prisma.integrationLog.findUnique({ where: { id: logId } });
    if (!entry) throw notFound("Запись журнала не найдена");
    if (entry.status !== "error") throw conflict("Повторить можно только неудачный вызов", "not_failed");
    const lock = operationKey(entry);
    if (this.inFlight.has(lock)) throw conflict("Этот вызов уже повторяется, подождите", "retry_in_progress");
    this.inFlight.add(lock);
    try {
      return entry.operation === "syncEmployees" ? await this.retrySync(entry) : await this.retryRequestCall(entry);
    } finally {
      this.inFlight.delete(lock);
    }
  }

  private async retrySync(entry: IntegrationLog) {
    const later = await this.prisma.integrationLog.findFirst({
      where: { system: "c1_zup", operation: "syncEmployees", status: "ok", created_at: { gt: entry.created_at } },
    });
    if (later) throw conflict("После этой ошибки синхронизация уже прошла успешно", "already_resolved");
    const { result, entry: ok } = await this.runSync(entry.id);
    return { entry: integrationLogView(ok), request: null, sync: result };
  }

  private async retryRequestCall(entry: IntegrationLog) {
    const isHris = HRIS_OPERATIONS.has(entry.operation);
    if (!entry.request_id || (!isHris && entry.operation !== "createDocument")) throw invalid("Этот вызов нельзя повторить", "not_retryable");
    const r = await this.prisma.request.findUnique({ where: { id: entry.request_id }, include: { employee: true } });
    if (!r || r.status !== "approved") throw conflict("Заявка не одобрена — проводить нечего", "not_retryable");
    if (isHris && r.external_1c_id) throw conflict(`Уже проведено в 1С:ЗУП: ${r.external_1c_id}`, "already_resolved");
    if (!isHris && r.docflow_id) throw conflict(`Заявление уже создано: ${r.docflow_id}`, "already_resolved");
    const author = await this.access.userIdOfEmployee(r.employee_id);

    if (isHris) {
      const res = await this.postToHris(r, r.employee, entry.id).catch((err) => {
        throw new ApiError(502, "integration_error", `1С:ЗУП: ${errorMessage(err)}`);
      });
      const updated = await this.prisma.$transaction(async (tx) => {
        if (res.vacation_balance_days != null) {
          await tx.employee.update({ where: { id: r.employee_id }, data: { vacation_balance_days: res.vacation_balance_days } });
        }
        if (author) {
          await this.notifications.send([author], {
            type: "request_approved",
            title: `Заявка №${r.id} проведена в 1С:ЗУП`,
            body: `Документ ${res.external_id}.`,
            link: `/requests/${r.id}`,
          }, tx);
        }
        return tx.request.update({ where: { id: r.id }, data: { external_1c_id: res.external_id } });
      });
      return { entry: integrationLogView(res.entry), request: this.requestRef(updated), sync: null };
    }

    const res = await this.createDocument(r, r.employee, entry.id).catch((err) => {
      throw new ApiError(502, "integration_error", `Documentolog: ${errorMessage(err)}`);
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      if (author) {
        await this.notifications.send([author], {
          type: "request_approved",
          title: "Заявление отправлено на подпись",
          body: `Заявка №${r.id}: документ ${res.docflow_id} в Documentolog.`,
          link: `/requests/${r.id}`,
        }, tx);
      }
      return tx.request.update({ where: { id: r.id }, data: { docflow_id: res.docflow_id } });
    });
    return { entry: integrationLogView(res.entry), request: this.requestRef(updated), sync: null };
  }

  private requestRef(r: Request) {
    return { id: r.id, status: r.status, external_1c_id: r.external_1c_id, docflow_id: r.docflow_id };
  }
}
