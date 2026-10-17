# JanaMen · web

Фронтенд Digital HR-платформы JanaMen (кейс Jana Post): профиль, заявки, обучение, уведомления и HR-ассистент сотрудника в одном пространстве.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · lucide · RU/KZ.

## Запуск

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Фронт всегда работает с реальным бэкендом (`backend/`, порт 8000) и AI-сервисом (`ai/`, порт 8001) — проще всего поднять всё через `docker compose up` из корня. Настройки — в `.env.local` (образец `.env.example`):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Адрес бэкенда (`Authorization: Bearer <token>`) |
| `AI_URL` | `http://localhost:8001` | AI-сервис; браузер ходит на `/ai/*`, Next.js проксирует сюда. Стрим ответа `/ai/ask/stream` идёт через route handler без сжатия, чтобы текст печатался по словам |

Docker: `docker build -t janamen-web --build-arg AI_URL=http://ai:8001 . && docker run -p 3000:3000 janamen-web`.

## Демо-аккаунты

Пароль у всех `demo1234`, или вход в один клик на странице логина.

| Логин | Роль | |
|---|---|---|
| `aigerim@jana.demo` | employee | Специалист СЦ, команда Ерлана |
| `daulet@jana.demo` | employee | Курьер, команда Ерлана |
| `erlan@jana.demo` | manager | Начальник смены; видит только Айгерим и Даулета |
| `asel@jana.demo` | employee | Бухгалтер другого отдела — Ерлану недоступна (403) |
| `dinara@jana.demo` | hr | HR-менеджер, видит всех |

Исходный набор данных восстанавливается на бэкенде: `npm run db:reset` в `backend/`.

## Демо-сценарий

1. Айгерим → Главная → «Отпуск» → даты → «Отправить на согласование» (или ассистенту: «Хочу в отпуск с 10 по 20 ноября» → «Открыть форму»).
2. Ерлан → Согласования → «Согласовать». `/requests/6` или `/team/4` (Асель) → 403.
3. Динара → заявка → «Провести» → номера 1С:ЗУП и Documentolog в таймлайне и в журнале интеграций HR-панели.
4. Айгерим → колокольчик → «Отпуск одобрен», таймлайн «как трекинг посылки» пройден.
5. Айгерим → Академия → «Техника безопасности на складе» → уроки → тест → результат в профиле + уведомление.

## Структура

```
src/lib/api/types.ts          типы по контракту (SPEC §5 + «API additions (manager)» в backend/README.md)
src/lib/api/client.ts         интерфейс ApiClient
src/lib/api/real.ts           реализация на fetch (единственный клиент)
src/lib/api/ai.ts             /ai/ask/stream (SSE) с откатом на /ai/ask и печатью по словам, /ai/escalate
src/app/ai/ask/stream/        прокси стрима к AI-сервису без gzip-буферизации
src/hooks/queries.ts          общие запросы с дедупликацией (dashboard, team, calendar, team academy…)
src/components/shell/         оболочка: сайдбар, шапка с заголовком страницы (PageHeader), нижняя навигация
src/components/requests/      заявки, таймлайн, решения (approve/reject), интерактивный календарь отпусков
src/i18n/                     ru.ts, kk.ts
src/app/(app)/                экраны внутри оболочки с авторизацией
```

Вёрстка: одна сетка на 12 колонок с единым отступом (`grid-12`, `--gutter`), один контейнер страниц (`page-container`, `--content-max`), заголовок страницы и действия — в шапке через `PageHeader`.
