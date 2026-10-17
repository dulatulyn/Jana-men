# JanaMen · web

Фронтенд Digital HR-платформы JanaMen (кейс Jana Post): профиль, заявки, обучение, уведомления и HR-ассистент сотрудника в одном пространстве.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · lucide · RU/KZ.

## Запуск

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

По умолчанию работает **мок API в браузере** (`NEXT_PUBLIC_API_MODE=mock`), бэкенд не нужен. Настройки — в `.env.local` (образец `.env.example`):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` — мок с состоянием в localStorage; `real` — запросы к бэкенду |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Адрес бэкенда в режиме `real` (`Authorization: Bearer <token>`) |
| `AI_URL` | `http://localhost:8001` | AI-сервис; браузер ходит на `/ai/*`, Next.js проксирует сюда |

Docker: `docker build -t janamen-web --build-arg NEXT_PUBLIC_API_MODE=real --build-arg AI_URL=http://ai:8001 . && docker run -p 3000:3000 janamen-web`.

## Демо-аккаунты

Пароль у всех `demo1234`, или вход в один клик на странице логина.

| Логин | Роль | |
|---|---|---|
| `aigerim@jana.demo` | employee | Специалист СЦ, команда Ерлана |
| `daulet@jana.demo` | employee | Курьер, команда Ерлана |
| `erlan@jana.demo` | manager | Начальник смены; видит только Айгерим и Даулета |
| `asel@jana.demo` | employee | Бухгалтер другого отдела — Ерлану недоступна (403) |
| `dinara@jana.demo` | hr | HR-менеджер, видит всех |

«Сбросить демо-данные» на странице логина возвращает исходный набор.

## Демо-сценарий

1. Айгерим → Главная → «Отпуск» → даты → «Отправить на согласование» (или ассистенту: «Хочу в отпуск с 10 по 20 ноября» → «Открыть форму»).
2. Ерлан → Согласования → «Согласовать». `/requests/6` или `/team/4` (Асель) → 403.
3. Динара → заявка → «Провести» → номера 1С:ЗУП и Documentolog в таймлайне и в журнале интеграций HR-панели.
4. Айгерим → колокольчик → «Отпуск одобрен», таймлайн «как трекинг посылки» пройден.
5. Айгерим → Академия → «Техника безопасности на складе» → уроки → тест → результат в профиле + уведомление.

## Структура

```
src/lib/api/types.ts     типы по контракту (SPEC §5)
src/lib/api/client.ts    интерфейс ApiClient
src/lib/api/real.ts      реализация на fetch
src/lib/api/mock/        мок: seed, RBAC, статусная машина, история, уведомления
src/lib/api/ai.ts        POST /ai/ask, /ai/escalate
src/i18n/                ru.ts, kk.ts
src/app/(app)/           экраны внутри оболочки с авторизацией
```

Мок соблюдает те же правила, что и бэкенд: роль + принадлежность ресурса (403), `submitted → manager_approved → approved` / `rejected` / `cancelled`, `request_events`, уведомления на каждом переходе и при назначении/завершении курса, проверка отпуска (остаток, прошедшие даты, пересечения).

Дополнительно к контракту фронт использует `GET /team` (список подчинённых, для HR — все) и `GET /employees/:id` (краткий профиль, 403 для чужих), а также необязательное поле `actor {id, full_name}` в событиях заявки.
