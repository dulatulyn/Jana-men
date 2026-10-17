# JanaMen — Backend (`/api/v1`)

Часть Вовы: API, RBAC, статусная машина заявок, уведомления, академия, моки интеграций 1С:ЗУП / Documentolog, эндпоинты для AI-ассистента. Стек: **Node + Express + TypeScript**, хранилище — **in-memory seed** (без БД — поднимается без миграций, идеально для демо). Контракт точно соответствует `web/src/lib/api/*` и `ai/BACKEND_CONTRACT.md`.

## Запуск локально

```bash
cd backend
npm install
npm run dev          # http://localhost:8000/api/v1  (health: /api/v1/health)
npm test             # 36 e2e-проверок всех 6 демо-сценариев
```

Фронт указывает на API через `NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:8000/api/v1`).
AI-сервис: `BACKEND_MODE=real`, `BACKEND_URL=http://localhost:8000/api/v1`.

## Демо-аккаунты (пароль у всех `demo1234`)

| Email | Роль |
|---|---|
| `aigerim@jana.demo` | employee (Айгерим Садыкова) |
| `daulet@jana.demo` | employee (Даулет, команда Ерлана) |
| `erlan@jana.demo` | manager (Ерлан Жумабаев) |
| `asel@jana.demo` | employee (Асель — Ерлану НЕ видна → 403) |
| `dinara@jana.demo` | hr (Динара Касымова) |

## Деплой на Vercel

API — serverless-функция (`api/index.ts`, роутинг через `vercel.json`).

```bash
cd backend
npx vercel --prod          # первый раз спросит логин: npx vercel login
# затем задать переменную окружения:
npx vercel env add JWT_SECRET production
```

После деплоя пропиши URL во фронт: `NEXT_PUBLIC_API_URL=https://<api>.vercel.app/api/v1`.

> ⚠️ Хранилище in-memory: состояние живёт в пределах тёплого инстанса и сбрасывается на холодном старте — этого достаточно для демо-прогона. Для продакшена заменяется на PostgreSQL (один слой репозиториев), см. SPEC §1–2.

## Эндпоинты

Auth, профиль/дашборд, заявки (+статусы/история/таймлайн), команда и календарь отпусков, академия (курсы/уроки/тест/назначение), уведомления, KB + логи/эскалация/аналитика ассистента, моки интеграций 1С/Documentolog + журнал + sync. Полный список — `SPEC.md` §5. Ошибки: `{ error: { code, message } }`, коды `401 / 403 / 404 / 422`.
