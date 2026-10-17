import { Injectable } from "@nestjs/common";
import { toDateOnly } from "../common/format";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateDocumentInput, DocsAdapter, HrisAdapter, HrisEmployee, PostAdvanceInput, PostVacationInput,
} from "./adapters";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/**
 * Stand-in for 1С:ЗУП. "1С" here is our own employees table: fetchEmployees returns it as-is
 * (so a sync reports no changes), and postVacation deducts the days the way 1С would.
 * Ids look like real ЗУП document numbers.
 */
@Injectable()
export class Mock1CZupAdapter implements HrisAdapter {
  readonly name = "mock-1c-zup";
  private readonly vacations = new Map<string, { external_id: string; vacation_balance_days: number }>();
  private readonly advances = new Map<string, { external_id: string }>();

  constructor(private prisma: PrismaService) {}

  async fetchEmployees(): Promise<HrisEmployee[]> {
    const rows = await this.prisma.employee.findMany({ include: { manager: { select: { external_id_1c: true } } }, orderBy: { id: "asc" } });
    return rows.map((e) => ({
      external_id_1c: e.external_id_1c,
      full_name: e.full_name,
      company: e.company,
      position: e.position,
      department_id: e.department_id,
      manager_external_id: e.manager?.external_id_1c ?? null,
      hire_date: toDateOnly(e.hire_date)!,
      vacation_balance_days: e.vacation_balance_days,
      phone: e.phone,
      work_type: e.work_type,
    }));
  }

  async postVacation(input: PostVacationInput) {
    const seen = this.vacations.get(input.idempotency_key);
    if (seen) return seen;
    const e = await this.prisma.employee.findUniqueOrThrow({ where: { external_id_1c: input.employee_external_id } });
    const posted = {
      external_id: `ЗУП-ОТ-${pad(input.request_id, 6)}`,
      vacation_balance_days: Math.max(0, e.vacation_balance_days - input.days),
    };
    this.vacations.set(input.idempotency_key, posted);
    return posted;
  }

  async postAdvance(input: PostAdvanceInput) {
    const seen = this.advances.get(input.idempotency_key);
    if (seen) return seen;
    const posted = { external_id: `ЗУП-АВ-${pad(input.request_id, 6)}` };
    this.advances.set(input.idempotency_key, posted);
    return posted;
  }
}

/** Stand-in for Documentolog: returns a plausible document number. */
@Injectable()
export class MockDocumentologAdapter implements DocsAdapter {
  readonly name = "mock-documentolog";
  private readonly documents = new Map<string, { docflow_id: string }>();

  async createDocument(input: CreateDocumentInput) {
    const seen = this.documents.get(input.idempotency_key);
    if (seen) return seen;
    const created = { docflow_id: `DL-${new Date().getFullYear()}-${pad(5000 + input.request_id, 5)}` };
    this.documents.set(input.idempotency_key, created);
    return created;
  }
}
