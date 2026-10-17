# JanaMen — Backend API (`/api/v1`)

NestJS 11 + Prisma 6 + PostgreSQL. Auth/JWT, RBAC with data scopes, request state machine, notifications, academy, knowledge base and assistant analytics, and the 1С:ЗУП / Documentolog integration layer (mocked behind interfaces). The HTTP contract matches `web/src/lib/api/types.ts` and `ai/BACKEND_CONTRACT.md` exactly.

## Run

**Everything (recommended):** from the repo root, `docker compose up --build` → web on http://localhost:3000, API on http://localhost:8000/api/v1. The API container applies migrations and seeds demo data on first start.

**Backend only, against your own Postgres:**

```bash
cd backend
cp .env.example .env          # set DATABASE_URL
npm install
npm run db:migrate            # prisma migrate deploy
npm run db:seed               # demo data (skips if already seeded; `SEED_FORCE=1 npm run db:seed` recreates)
npm run dev                   # http://localhost:8000/api/v1
```

| Script | |
|---|---|
| `npm test` | end-to-end tests over HTTP against a real Postgres (`TEST_DATABASE_URL`, DB name must contain `test`) |
| `npm run db:reset` | drop everything, re-migrate, re-seed |
| `npm run kb:sync` | regenerate `prisma/kb-data.json` from `ai/kb/*.md` after editing articles |
| `npm run typecheck` / `npm run build` | |

### Environment

| Var | Default | |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `JWT_SECRET` | dev value | **required (≥16 chars) when `NODE_ENV=production`** — the app refuses to boot otherwise |
| `PORT` | `8000` | |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated browser origins, `*` for any |
| `INTEGRATIONS_MODE` | `mock` | which 1С / Documentolog implementation to bind |
| `INTEGRATIONS_TIMEOUT_MS` | `10000` | timeout of one 1С / Documentolog call (post, create document) |
| `INTEGRATIONS_SYNC_TIMEOUT_MS` | `60000` | timeout of the 1С employee sync |

## Demo accounts — password `demo1234`

| Email | Role | |
|---|---|---|
| `aigerim@jana.demo` | employee | Айгерим Садыкова, сортировочный центр |
| `daulet@jana.demo` | employee | Даулет Ахметов, курьер (команда Ерлана) |
| `erlan@jana.demo` | manager | Ерлан Жумабаев, начальник смены |
| `asel@jana.demo` | employee | Асель Нурланова, бухгалтерия — **Ерлану не видна (403)** |
| `dinara@jana.demo` | hr | Динара Касымова, HR |

## Layout

```
src/
  auth/           login, /me, global JwtAuthGuard + RolesGuard, @Public/@Roles/@CurrentUser
  access/         data-scope rules (own / direct reports / everyone) and who approves what
  requests/       request lifecycle — the state machine lives here
  profile/        /profile, /dashboard
  team/           /team, /employees/:id, /team/calendar
  academy/        courses, lessons, quiz, assignments
  notifications/  list/read + NotificationsService used by every module
  assistant/      /kb, /assistant/logs|escalate|unanswered|stats
  integrations/   HrisAdapter + DocsAdapter interfaces, mock implementations, journal, 1С sync
  common/         error envelope, validation pipe, JSON views, date/money formatting
prisma/           schema, migrations, seed (superset of web's former mock seed)
test/             e2e suites
```

## Rules the API enforces

**Access (SPEC §3).** Every endpoint checks the role *and* that the resource is in the caller's scope: own data; a manager's direct reports; HR — everyone. A manager opening someone outside their team gets `403`. Team views return a short profile without phone or 1С id. HR-only endpoints (stats, unanswered, KB edits, integrations) are `@Roles("hr")`.

**Request lifecycle.**

```
submitted ──manager──▶ manager_approved ──HR──▶ approved ──▶ 1С:ЗУП postVacation/postAdvance + Documentolog createDocument
submitted | manager_approved ──reject (reason required)──▶ rejected
submitted ──author──▶ cancelled
```

- Stage 1 belongs to the author's manager; if the manager has no account, it falls to HR. Nobody approves their own request.
- Transitions are compare-and-set on the current status, so two simultaneous approvals give one `200` and one `409`.
- Vacation: days are computed server-side; must fit `balance − days already pending`; no overlap with own active requests; not in the past. Submissions are serialized per employee with a row lock, so parallel tabs can't overspend.
- Advance: 1 – 1 000 000 ₸, reason required.
- Final approval commits first, then calls 1С and Documentolog. If one is down, the approval stands, the failure is written to the integration journal, and HR is notified. 1С reports the new vacation balance, which is mirrored locally.
- Every transition writes a `request_events` row and notifies the author and the next approver.

**Academy.** Quiz unlocks after all lessons; pass mark 70 %; retakes keep the best score; completion notifies the employee and whoever assigned the course. Managers assign to their team, HR to anyone, anyone may self-enroll.

**Assistant.** `user_id` on logs always comes from the JWT. Escalation is idempotent and only works on your own log (others look like `404`). HR users can't escalate: `422 escalation_not_allowed`. Unanswered = `no_answer` + escalated questions, grouped by normalized text, labeled with the most common phrasing. KB `body_md` is stored byte-for-byte as in `ai/kb` — the AI checks quotes against it.

**Errors.** Always `{ "error": { "code", "message" } }`: `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 invalid_transition` (journal retry: `not_failed`, `already_resolved`, `retry_in_progress`, `not_retryable`), `422 validation_error` (or a specific code like `insufficient_balance`, `overlap`, `past_date`, `already_assigned`, `range_too_large`, `escalation_not_allowed`), `502 integration_error`.

## API additions (manager)

Only additions: every existing field keeps its name and meaning. "Team" means direct reports for a manager and every employee except the caller for HR (same as `GET /team`). Dates are `YYYY-MM-DD`.

### `GET /team` (manager, hr): new fields on each member

```json
[
  {
    "id": 2, "full_name": "Даулет Ахметов", "position": "Курьер", "department": "Сортировочный центр, Алматы",
    "department_id": 1, "work_type": "courier", "hire_date": "2023-06-01", "vacation_balance_days": 24,
    "enrollments": [ "…unchanged Enrollment objects…" ],
    "pending_requests": 1,
    "on_vacation": { "start_date": "2026-10-15", "end_date": "2026-10-19" },
    "next_vacation": { "start_date": "2026-11-10", "end_date": "2026-11-16", "status": "submitted" }
  }
]
```

- `pending_requests` — this member's requests the caller can approve or reject right now (the same rule as the approvals inbox): for a manager, the member's `submitted` requests; for HR, `manager_approved` ones plus `submitted` ones whose author has no manager with an account.
- `on_vacation` — an `approved` vacation with `start_date ≤ today ≤ end_date`, else `null`.
- `next_vacation` — the nearest `submitted` / `manager_approved` / `approved` vacation starting today or later (other than `on_vacation`), else `null`.
- `department_id` — id for the calendar filter below.

### `GET /employees/:id`: the same member object plus `requests`

```json
{
  "id": 2, "full_name": "Даулет Ахметов", "…": "all GET /team member fields",
  "requests": [
    { "id": 4, "type": "vacation", "status": "submitted", "created_at": "2026-10-16T13:04:00.000Z",
      "employee": { "id": 2, "full_name": "Даулет Ахметов" }, "summary": "10.11.2026 – 16.11.2026 · 7 дн." }
  ]
}
```

`requests` is exactly the `GET /requests` list-item shape, newest first, at most 20. Scope is unchanged: yourself, your direct reports (manager) or anyone (HR); otherwise `403`, unknown id `404`.

### `GET /team/calendar?from&to&department_id` (manager, hr)

Response shape unchanged: `[{ "employee": {"id", "full_name"}, "start_date", "end_date", "status" }]`.

- Any range up to **400 days** inclusive (week, month, quarter, year). Longer: `422 range_too_large`. `from > to` or a bad date: `422 validation_error`.
- No params: today −30 … today +90. Only `from`: `from` … `from`+120. Only `to`: `to`−120 … `to`.
- `department_id` (optional): HR filters by any department (`404` if it doesn't exist). A manager may pass only their own department (it narrows their team); any other department is `403`.

### `GET /team/academy` (manager, hr)

One row per catalog course, ordered by course id, counted over the caller's team:

```json
[
  {
    "course": { "id": 3, "title": "Клиентский сервис на последней миле", "cover": "service", "duration_min": 15 },
    "assigned": 1, "completed": 0, "in_progress": 1, "not_started": 0, "overdue": 1,
    "members": [
      { "employee": { "id": 2, "full_name": "Даулет Ахметов" }, "enrollment_id": 6, "status": "in_progress",
        "progress": 25, "due_date": "2026-10-15", "overdue": true, "score": null, "completed_at": null }
    ],
    "unassigned": [ { "id": 1, "full_name": "Айгерим Садыкова" } ]
  }
]
```

- `assigned` = team members who have the course (any status, self-enrolled included) = `completed + in_progress + not_started`.
- `overdue` = not completed and `due_date` < today. `progress` = `progress_pct` (0–100). `members` are sorted by name.
- `unassigned` = team members without the course: the list for an "assign" picker.

### Assigning a course: `POST /enrollments` (unchanged)

`{ "employee_id": 1, "course_id": 3, "due_date": "2026-10-31" | null }` → `201` Enrollment. A manager may assign to direct reports only (`403` otherwise), HR to anyone; a duplicate is `422 already_assigned`; a past `due_date` is `422`. The employee gets a `course_assigned` notification. The seed has a third course (`cover: "service"`) that nobody on Ерлан's team except Даулет has, so the assign flow can be demoed.

### Integration journal (hr)

`GET /integrations/log` entries gain `request_id`, `idempotency_key`, `retry_of`, `duration_ms` and `retryable` (true on the latest failed entry of an operation that hasn't succeeded since).

`POST /integrations/log/:id/retry` re-runs a failed call (post to 1С, create document, or the employee sync) with the same idempotency key:

```json
{ "entry": { "id": 31, "system": "documentolog", "operation": "createDocument", "status": "ok", "details": "Заявление №10 → DL-2026-05010, отправлено на подпись",
             "request_id": 10, "idempotency_key": "janamen-request-10", "retry_of": 10, "duration_ms": 3, "retryable": false, "created_at": "…" },
  "request": { "id": 10, "status": "approved", "external_1c_id": "ЗУП-ОТ-000398", "docflow_id": "DL-2026-05010" },
  "sync": null }
```

For a sync retry `request` is `null` and `sync` is `{synced, changed, at}`. Errors: `404`; `409 not_failed` (entry was ok), `409 already_resolved` (succeeded since), `409 retry_in_progress`, `409 not_retryable`; `502 integration_error` if the system fails again (a new error entry is journaled). The author is notified when a retry posts their request. The seed contains one failed Documentolog call (request №10) to demo this.

## Integration architecture

**Current design.** The domain code depends only on `HrisAdapter` (1С:ЗУП: `fetchEmployees`, `postVacation`, `postAdvance`) and `DocsAdapter` (Documentolog: `createDocument`) in `src/integrations/adapters.ts`. `IntegrationsService` wraps every call with a timeout (an `AbortSignal` is passed to the adapter), writes each call to `integration_log` (ok/error, request id, idempotency key, duration) and never lets a failure undo business data.

**Transactions.** The final approval commits first; the 1С post and the Documentolog document run after the commit, and their ids plus the mirrored vacation balance are saved in a second transaction. An outage of 1С or Documentolog leaves the request `approved`, journals the error and notifies HR, who retries it from the journal.

**Idempotency.** Every post carries `idempotency_key = "janamen-request-<id>"`. A real adapter must send it to 1С / Documentolog (an external-id attribute of the document, looked up before creating) so a retry after a timeout returns the existing document instead of a duplicate. The mocks honour it, and the tests cover a call that times out on our side but succeeds in "1С".

**Plugging in a real system.** Implement the two interfaces (HTTP/OData to 1С, Documentolog REST), use the `signal` in `fetch`, bind the classes in `IntegrationsModule` under a new `INTEGRATIONS_MODE`. Nothing else changes.

**Production-ready now:** adapter interfaces, journal, per-call timeouts, idempotency keys, HR retry of failed calls, sync that upserts by `external_id_1c` and never deletes.

**Next:**
- Transactional outbox plus a worker with backoff, instead of calling adapters inside the approve request (also covers a crash between commit and post, and multi-instance locking).
- Departments by 1С id: `HrisEmployee.department_id` is our id today; a real sync needs `department_external_id` and a departments upsert.
- Dismissed employees: mark inactive instead of leaving them as they are; incremental sync by change date for large staff lists.
- Documentolog status callback (signed / rejected) on a shared-secret webhook, stored on the request and shown in the timeline.
- Secrets and certificates for the real APIs in a vault, retries with jitter, alerting on repeated errors.
