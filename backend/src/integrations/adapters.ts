/**
 * Integration contracts (SPEC §2). The rest of the backend talks only to these interfaces;
 * connecting the real 1С:ЗУП or Documentolog means writing one class and binding it in
 * IntegrationsModule — nothing else changes.
 */
import type { WorkType } from "@prisma/client";

export const HRIS_ADAPTER = Symbol("HrisAdapter");
export const DOCS_ADAPTER = Symbol("DocsAdapter");

/** An employee record as the HRIS (1С:ЗУП) reports it. */
export interface HrisEmployee {
  external_id_1c: string;
  full_name: string;
  company: string;
  position: string;
  department_id: number;
  manager_external_id: string | null;
  hire_date: string; // YYYY-MM-DD
  vacation_balance_days: number;
  phone: string;
  work_type: WorkType;
}

export interface PostVacationInput {
  request_id: number;
  employee_external_id: string;
  start_date: string;
  end_date: string;
  days: number;
}

export interface PostAdvanceInput {
  request_id: number;
  employee_external_id: string;
  amount: number;
}

/** 1С:ЗУП — source of truth for HR data. We only read employees and post approved documents. */
export interface HrisAdapter {
  readonly name: string;
  fetchEmployees(): Promise<HrisEmployee[]>;
  /** Posts an approved vacation; returns the 1С document id and the employee's balance after posting. */
  postVacation(input: PostVacationInput): Promise<{ external_id: string; vacation_balance_days: number }>;
  postAdvance(input: PostAdvanceInput): Promise<{ external_id: string }>;
}

export interface CreateDocumentInput {
  request_id: number;
  kind: "vacation_application" | "advance_application";
  employee_full_name: string;
  summary: string;
}

/** Documentolog — e-document flow; an approved request becomes an application sent for signature. */
export interface DocsAdapter {
  readonly name: string;
  createDocument(input: CreateDocumentInput): Promise<{ docflow_id: string }>;
}
