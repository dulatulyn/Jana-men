# AI-сервис → бэкенд: что нужно от API (для Вовы)

AI-сервис (`ai/`, порт 8001) ходит в API **только в 5 эндпоинтов**. Включается так: `BACKEND_MODE=real`, `BACKEND_URL=http://api:8000/api/v1`.

**Авторизация:** AI ничего не знает про пользователей. Он пересылает заголовок `Authorization: Bearer <jwt>` от фронта **как есть**. Значит, бэкенд сам определяет пользователя по JWT и отдаёт только его данные. Если вернёшь `401`, AI ответит фронту `401`.

---

### 1. `GET /profile` — профиль текущего пользователя
```json
{
  "full_name": "Айгерим Садыкова",
  "company": "ТОО «Jana Post»",
  "position": "Специалист сортировочного центра",
  "department": "Сортировочный центр, Алматы",
  "manager": { "id": 3, "full_name": "Ерлан Жумабаев" },
  "hire_date": "2022-03-14",
  "vacation_balance_days": 18,
  "work_type": "warehouse"
}
```
`department` — строка (название). `manager` может быть `null`.

### 2. `GET /kb` — все статьи базы знаний
```json
[
  {
    "slug": "vacation-annual",
    "title": "Ежегодный оплачиваемый отпуск",
    "category": "vacation",
    "body_md": "# Ежегодный оплачиваемый отпуск\n\n## Сколько дней положено\n...",
    "updated_at": "2026-10-16T12:00:00Z"
  }
]
```
Доступен всем ролям. AI кеширует ответ на 60 секунд.

### 3. `POST /assistant/logs` — записать вопрос/ответ
Запрос:
```json
{
  "question": "Сколько дней отпуска положено?",
  "answer": "…",
  "status": "answered",
  "sources": [{ "slug": "vacation-annual", "title": "Ежегодный оплачиваемый отпуск" }]
}
```
`status` ∈ `answered | no_answer | refused`. `user_id` бери из JWT.
Ответ: `{ "log_id": 123 }`

### 4. `POST /assistant/escalate` — передать вопрос в HR
Запрос: `{ "log_id": 123 }` → ставишь `escalated=true`, создаёшь уведомление HR.
Ответ: любой JSON, например `{ "ok": true }`.
Ошибки `4xx` AI отдаёт фронту как есть (статус и тело `{ "error": { "code", "message" } }`), например `422 escalation_not_allowed`, если вопрос передаёт сам HR, или `404` для чужого `log_id`.

### 5. `GET /me` — роль текущего пользователя
AI читает только поле `role` (`employee | manager | hr`). Для HR ассистент не предлагает «Передать в HR» (`can_escalate: false`) и вместо этого советует добавить статью в базу знаний. Если `/me` недоступен (не `401`), AI считает пользователя работником.

---

## Seed базы знаний: `ai/kb/*.md` → `kb_articles`

Каждый файл устроен так: frontmatter + markdown.
```
---
slug: vacation-annual
title: Ежегодный оплачиваемый отпуск
title_kk: Жыл сайынғы ақылы демалыс
category: vacation
demo: true
note: Демо-контент …
---
# Ежегодный оплачиваемый отпуск
...
```

| Поле в `kb_articles` | Откуда |
|---|---|
| `slug` | frontmatter `slug` |
| `title` | frontmatter `title` |
| `category` | frontmatter `category` |
| `body_md` | всё после второго `---` (без frontmatter), trim |
| `updated_at` | now() при seed |

`title_kk`, `demo` и `note` можно не хранить. **Не меняй текст `body_md` при импорте:** AI проверяет цитаты дословно по этому тексту.

Пример seed на Python:
```python
import pathlib, re
for f in sorted(pathlib.Path("ai/kb").glob("*.md")):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", f.read_text("utf-8"), re.S)
    meta = dict(l.split(":", 1) for l in m.group(1).splitlines() if ":" in l)
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    upsert_kb(slug=meta["slug"], title=meta["title"], category=meta["category"], body_md=m.group(2).strip())
```

Если HR правит статью через `PUT /kb/:slug`, AI подхватит новую версию максимум через 60 секунд.
