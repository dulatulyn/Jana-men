# JanaMen AI HR-assistant (`ai/`)

A separate service (TypeScript, Hono, Anthropic SDK). It answers HR questions **only from the knowledge base**, always shows the source, says honestly when there is no answer, and never sees other employees' data.

```bash
npm install
npm run dev        # http://localhost:8001  (fallback mode if ANTHROPIC_API_KEY is unset)
npm test           # unit tests (the model is mocked)
npm run eval       # 30 eval cases, prints a table: fallback without a key, LLM with one
npm run build && npm start
docker build -t janamen-ai . && docker run -p 8001:8001 --env-file .env janamen-ai
```

Environment variables: see `.env.example` (`BACKEND_MODE=mock|real`, `BACKEND_URL`, `ANTHROPIC_API_KEY`, `AI_MODEL=claude-sonnet-5-5`, `PORT=8001`, `CORS_ORIGINS`).

## API
- `POST /ask` with `Authorization: Bearer <jwt>` and body `{question, locale: "ru"|"kk", history?}` returns `{status: answered|no_answer|refused, answer, sources:[{slug,title}], action|null, can_escalate, log_id, mode: llm|fallback}`
- `POST /escalate` with `{log_id}` forwards the question to HR (in mock mode it returns `{ok:true}`)
- `GET /health`
- No token or a bad token gives `401`. A bad body gives `422`. If the backend is down, the service returns `502`.

In mock mode the token is `mock.<login>`, where login is one of `aigerim`, `daulet`, `erlan`, `asel`, `dinara`. Profiles are in `mock/profiles.json`.

## How it works
```
question ─▶ pre-filter (regex: injection / other people's data / HR decisions) ──▶ refused
        └─▶ LLM: rules + whole KB (prompt-cached) + ONLY my profile ─▶ strict JSON
                 {status, answer, citations:[{slug, quote}], action}
            └─▶ server-side verification ─▶ answered | no_answer
        └─▶ (no key / API error) deterministic BM25 over KB sections ─▶ section quoted verbatim | no_answer
```

## Anti-hallucination design (5 points)
1. **The context is closed.** The model receives only the KB articles and the current user's own profile, fetched from the backend with the user's own JWT. The service has no way to request anyone else's data, so it cannot leak it.
2. **Strict structured output.** Every answer is JSON with `status` and `citations:[{slug, quote}]`. Free-form text is not accepted.
3. **Citations are checked by code, not trusted.** A quote must appear **verbatim** in the cited article (after normalizing case, quotes and whitespace). The slug must exist. Every number in the answer must appear in a verified quote. If any check fails, the answer is replaced with a standard "no reliable answer, pass to HR?" message. Profile answers cite `profile` and are checked against the profile values.
4. **Two layers of refusal.** A cheap regex pre-filter (prompt injection, other employees' salary/vacation/contacts, "list all employees", "approve my request") runs before the model, and the model has the same rules. Refusals never carry sources.
5. **The assistant never acts.** Vacation and advance intents return a `prefill_request` action. Dates and days (calendar days, inclusive) are recomputed by code and checked against the vacation balance, with a warning if the balance is exceeded. The user reviews the form and submits it. Without an API key or when the API fails, a deterministic search returns the KB section **verbatim** with its source, or `no_answer`, with `mode:"fallback"`. The demo never crashes.

## Layout
`src/assistant.ts` orchestration · `src/guard.ts` pre-filter · `src/verify.ts` citation check · `src/llm.ts` prompt and Claude call · `src/fallback.ts` BM25 · `src/action.ts` dates and actions · `src/profile.ts` own-profile answers · `src/backend/` `BackendClient` (Mock/Real) · `kb/*.md` knowledge base (demo content, fictional ТОО «Jana Post») · `eval/` eval cases and runner · `BACKEND_CONTRACT.md` what the backend must provide.
