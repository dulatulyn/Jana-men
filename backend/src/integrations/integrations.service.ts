import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IntegrationSystem, Request } from "@prisma/client";
import { ApiError } from "../common/errors";
import { fromDateOnly, toDateOnly } from "../common/format";
import { requestSummary, type VacationPayload, type AdvancePayload } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import { DOCS_ADAPTER, HRIS_ADAPTER, type DocsAdapter, type HrisAdapter } from "./adapters";

export interface ProvisionResult {
  external_1c_id: string | null;
  docflow_id: string | null;
  /** Balance reported by 1С after posting a vacation; null if not applicable or the call failed. */
  vacation_balance_days: number | null;
  errors: string[];
}

/** Calls the adapters and writes every call (ok or error) to integration_log. */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger("Integrations");

  constructor(
    private prisma: PrismaService,
    @Inject(HRIS_ADAPTER) private hris: HrisAdapter,
    @Inject(DOCS_ADAPTER) private docs: DocsAdapter,
  ) {}

  private async track<T>(system: IntegrationSystem, operation: string, call: () => Promise<T>, describe: (r: T) => string): Promise<T> {
    try {
      const result = await call();
      await this.prisma.integrationLog.create({ data: { system, operation, status: "ok", details: describe(result) } });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`${system}.${operation} failed: ${message}`);
      await this.prisma.integrationLog.create({ data: { system, operation, status: "error", details: message.slice(0, 500) } });
      throw err;
    }
  }

  /** Pulls employees from 1С:ЗУП and upserts them by external_id_1c. */
  async syncEmployees() {
    let snapshot;
    try {
      snapshot = await this.hris.fetchEmployees();
    } catch (err) {
      await this.prisma.integrationLog.create({
        data: { system: "c1_zup", operation: "syncEmployees", status: "error", details: err instanceof Error ? err.message : String(err) },
      });
      throw new ApiError(502, "integration_error", "1С:ЗУП недоступна, попробуйте позже");
    }

    const existing = await this.prisma.employee.findMany();
    const byExternal = new Map(existing.map((e) => [e.external_id_1c, e]));
    let changed = 0;

    await this.prisma.$transaction(async (tx) => {
      // Pass 1: create/update scalar fields. Pass 2: managers, once every external id has a row.
      for (const s of snapshot) {
        const data = {
          full_name: s.full_name, company: s.company, position: s.position, department_id: s.department_id,
          hire_date: fromDateOnly(s.hire_date), vacation_balance_days: s.vacation_balance_days, phone: s.phone, work_type: s.work_type,
        };
        const cur = byExternal.get(s.external_id_1c);
        if (!cur) {
          const created = await tx.employee.create({ data: { external_id_1c: s.external_id_1c, ...data } });
          byExternal.set(s.external_id_1c, created);
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
    });

    const details = `Синхронизировано ${snapshot.length} сотрудников, ${changed ? `изменений: ${changed}` : "изменений нет"}`;
    await this.prisma.integrationLog.create({ data: { system: "c1_zup", operation: "syncEmployees", status: "ok", details } });
    return { synced: snapshot.length, changed, at: new Date().toISOString() };
  }

  /**
   * After final approval: post to 1С:ЗУП, then create the Documentolog application.
   * Never throws — a failed call is journaled and reported in `errors`, the approval stands.
   */
  async provisionApproved(r: Request, employee: { external_id_1c: string; full_name: string }): Promise<ProvisionResult> {
    const out: ProvisionResult = { external_1c_id: null, docflow_id: null, vacation_balance_days: null, errors: [] };

    try {
      if (r.type === "vacation") {
        const p = r.payload as VacationPayload;
        const res = await this.track("c1_zup", "postVacation",
          () => this.hris.postVacation({ request_id: r.id, employee_external_id: employee.external_id_1c, start_date: p.start_date, end_date: p.end_date, days: p.days }),
          (x) => `Заявка №${r.id} → ${x.external_id}`);
        out.external_1c_id = res.external_id;
        out.vacation_balance_days = res.vacation_balance_days;
      } else {
        const p = r.payload as AdvancePayload;
        const res = await this.track("c1_zup", "postAdvance",
          () => this.hris.postAdvance({ request_id: r.id, employee_external_id: employee.external_id_1c, amount: p.amount }),
          (x) => `Заявка №${r.id} → ${x.external_id}`);
        out.external_1c_id = res.external_id;
      }
    } catch (err) {
      out.errors.push(`1С:ЗУП: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const res = await this.track("documentolog", "createDocument",
        () => this.docs.createDocument({
          request_id: r.id,
          kind: r.type === "vacation" ? "vacation_application" : "advance_application",
          employee_full_name: employee.full_name,
          summary: requestSummary(r),
        }),
        (x) => `Заявление №${r.id} → ${x.docflow_id}, отправлено на подпись`);
      out.docflow_id = res.docflow_id;
    } catch (err) {
      out.errors.push(`Documentolog: ${err instanceof Error ? err.message : err}`);
    }

    return out;
  }
}
