# JanaMen — Digital HR Platform

Jana Post × Terricon Valley Hackathon 2026. One web platform where an employee sees their profile, requests, training, notifications and an HR assistant; managers and HR approve and track. Spec: [`SPEC.md`](SPEC.md).

## Run

```bash
docker compose up --build
```

Open http://localhost:3000 and use a demo account (one-click buttons on the login page). Optional settings — a Claude API key for the assistant, ports — go in a root `.env`, see [`.env.example`](.env.example). Without a key the assistant runs in keyword-search fallback mode.

| Service | | Port |
|---|---|---|
| `web` | Next.js UI ([web/](web/README.md)) | 3000 |
| `api` | NestJS + Prisma backend ([backend/](backend/README.md)) | 8000 |
| `ai` | HR assistant service ([ai/](ai/README.md)) | internal |
| `db` | PostgreSQL 16 | internal |

## Demo accounts — password `demo1234`

| Email | Role |
|---|---|
| `aigerim@jana.demo` | employee |
| `daulet@jana.demo` | employee (Erlan's team) |
| `erlan@jana.demo` | manager |
| `asel@jana.demo` | employee (other department — Erlan gets 403) |
| `dinara@jana.demo` | HR |

## Demo scenario

1. **Айгерим** — home: profile, vacation balance, tasks, course, notifications.
2. Files a vacation request — via the form, or by telling the assistant «хочу в отпуск с 10 по 20 ноября», which pre-fills the form.
3. **Ерлан** sees it in Approvals and approves. Opening Асель's profile shows «Нет доступа» — the API returns 403.
4. **Динара** posts it → 1С:ЗУП and Documentolog (mocked) → Айгерим gets a notification, the timeline updates, the balance drops.
5. Айгерим completes the assigned course and quiz → progress in her profile, notification.
6. Assistant: «Сколько дней отпуска положено?» → answer with source; «Какая зарплата у Ерлана?» → refusal; unknown question → «Передать в HR».

## Architecture

```
Browser ──JWT──▶ web (Next.js) ──/ai/*──▶ ai ──JWT of the user──▶ api ──▶ PostgreSQL
   └────────────────JWT─────────────────────────────────────────▶ api ──▶ HrisAdapter ─▶ 1С:ЗУП (mock)
                                                                      └─▶ DocsAdapter ─▶ Documentolog (mock)
```

The assistant calls the API with the current user's token, so it can only ever see that user's data.

## Implemented / mocked / next

| | |
|---|---|
| **Implemented** | auth & roles with server-side data scopes, requests with two-stage approval and timeline, notifications, academy with quizzes, team & vacation calendar, HR dashboard, assistant with sources / refusals / escalation / pre-filled requests, knowledge base editing, integration journal |
| **Mocked** | 1С:ЗУП (employee sync, posting vacations/advances) and Documentolog (applications for signature) — behind `HrisAdapter` / `DocsAdapter`; replacing a mock is one class |
| **Next** | real 1С and Documentolog adapters, e-signature, embeddings once the knowledge base grows, native mobile app |
