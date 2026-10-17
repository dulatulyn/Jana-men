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
npm run db:seed               # demo data (skips if already seeded; `-- --force` to recreate)
npm run dev                   # http://localhost:8000/api/v1
```

| Script | |
|---|---|
| `npm test` | 43 end-to-end tests over HTTP against a real Postgres (`TEST_DATABASE_URL`, DB name must contain `test`) |
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
prisma/           schema, migrations, seed (data mirrors web's mock seed)
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

**Assistant.** `user_id` on logs always comes from the JWT. Escalation is idempotent and only works on your own log (others look like `404`). Unanswered = `no_answer` + escalated questions, grouped by normalized text, labeled with the most common phrasing. KB `body_md` is stored byte-for-byte as in `ai/kb` — the AI checks quotes against it.

**Errors.** Always `{ "error": { "code", "message" } }`: `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 invalid_transition`, `422 validation_error` (or a specific code like `insufficient_balance`, `overlap`, `past_date`, `already_assigned`), `502 integration_error`.

## Connecting the real 1С:ЗУП / Documentolog

The rest of the code depends only on `HrisAdapter` and `DocsAdapter` (`src/integrations/adapters.ts`). To go live, implement them against the real APIs and bind them in `IntegrationsModule` under a new `INTEGRATIONS_MODE`. Journaling, error handling and the approval flow stay as they are. The mock 1С treats our own `employees` table as the 1С state, so a sync reports no changes.
