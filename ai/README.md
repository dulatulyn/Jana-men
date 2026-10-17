# JanaMen AI HR-assistant (`ai/`)

A separate service (TypeScript, Hono, OpenAI or Anthropic SDK). It answers HR questions **only from the knowledge base**, always shows the source, says honestly when there is no answer, and never sees other employees' data.

```bash
npm install
npm run dev        # http://localhost:8001, watch mode, loads ai/.env if it exists
npm run serve      # same without watch
npm test           # unit tests (the model SDKs are mocked)
npm run eval       # 30 eval cases, prints a table: fallback without a key, LLM with one
npm run build && npm start
docker build -t janamen-ai . && docker run -p 8001:8001 --env-file .env janamen-ai
```

## Configuration

`dev`, `serve`, `start` and `eval` run Node with `--env-file-if-exists=.env`, so `ai/.env` is loaded automatically (variables already set in the environment win, a missing file is fine). Docker / compose pass variables directly. See `.env.example`:

| Var | Default | |
|---|---|---|
| `AI_PROVIDER` | auto | `openai`, `anthropic` or `none`. Auto: OpenAI if `OPENAI_API_KEY` is set, else Anthropic if `ANTHROPIC_API_KEY` is set, else the BM25 fallback |
| `OPENAI_API_KEY` | — | |
| `OPENAI_MODEL` | `gpt-5.4-mini` | |
| `OPENAI_REASONING_EFFORT` | `low` | empty = parameter omitted |
| `OPENAI_TIMEOUT_MS` | `20000` | one retry on connection errors, 429 and 5xx |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | — / `claude-sonnet-5-5` | |
| `BACKEND_MODE` / `BACKEND_URL` | `mock` / `http://localhost:8000/api/v1` | |
| `PORT`, `CORS_ORIGINS` | `8001`, `http://localhost:3000` | |

A missing key for the chosen provider, an unknown provider or effort only print a startup warning; the service still starts.

## API

All endpoints except `/health` need `Authorization: Bearer <jwt>` (the user's JWT, forwarded to the backend as is).

- `POST /ask` with `{question, locale: "ru"|"kk", history?}` returns `{status: answered|no_answer|refused, answer, sources:[{slug,title}], action|null, can_escalate, log_id, mode: llm|fallback}`.
- `POST /ask/stream`: same body and auth, answers with Server-Sent Events (`text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`). The whole pipeline, including server-side verification, runs first; only the verified answer is streamed:
  ```
  event: ping   data: {}                                         sent right away so proxies flush
  event: meta   data: {"status","sources","action","can_escalate","log_id","mode"}   the /ask response without answer
  event: delta  data: {"text":"<chunk>"}                         many; concatenated they equal the /ask answer exactly
  event: done   data: {}
  event: error  data: {"code":"assistant_error","message":"…"}   instead of meta/delta/done if the pipeline fails
  ```
  Deltas are word-sized (whitespace and newlines kept), 20–35 ms apart; long answers are grouped into bigger chunks so a stream takes at most about 2.5 s. `401` (no or invalid token), `422` (bad body) and `502` (backend down) are ordinary JSON error responses sent before the stream starts.
- `POST /escalate` with `{log_id}` forwards the question to HR. Backend `4xx` errors are passed through with their status and `{error:{code,message}}` body (for example `422 escalation_not_allowed` for HR users, `404` for someone else's log).
- `GET /health` returns `{ok, mode: "llm"|"fallback", backend: "mock"|"real", provider: "openai"|"anthropic"|null, model, llm_available}`. `llm_available` is false while the provider is switched off after an auth or quota error.
- No token or a bad token gives `401`. A bad body gives `422`. If the backend is down, the service returns `502`.

In mock mode the token is `mock.<login>`, where login is one of `aigerim`, `daulet`, `erlan` (manager), `asel`, `dinara` (HR). Profiles are in `mock/profiles.json`.

## Roles

The service reads the user's role from `GET /me`. For HR users `can_escalate` is always `false`, the no-answer text suggests adding an article to the knowledge base instead of «Передать в HR», refusals do not offer passing the question to HR, and the model is told the user is an HR specialist.

## How it works
```
question ─▶ pre-filter (regex: injection / other people's data / HR decisions) ──▶ refused
        └─▶ LLM: whole KB + rules (prompt-cached prefix) + ONLY my profile ─▶ strict JSON
                 {status, answer, citations:[{slug, quote}], action}
            └─▶ server-side verification ─▶ answered | no_answer
        └─▶ (no key / provider error) deterministic BM25 over KB sections ─▶ section quoted verbatim | no_answer
```

**Providers.** OpenAI uses the Responses API (`responses.parse` with a strict JSON schema generated from the same zod schema, `store: false`, `prompt_cache_key`). The static part (knowledge base, then rules) goes first in `instructions` so it is cached across users; the user's profile, the date, the locale and the role go in a developer message after it. Anthropic uses the same rules, KB and profile blocks with a cache breakpoint after the KB.

**Graceful degradation.** Any provider error (401, quota, network, timeout, 5xx, refusal, incomplete or unparsable output) makes that request use the BM25 fallback (`mode: "fallback"`) and logs one line with the provider, error class, status and code, never the error text or the key. After a 401/403 (or `insufficient_quota` on OpenAI) the provider is switched off for 5 minutes so requests go straight to the fallback; at startup the OpenAI key is checked with a free `models.retrieve` call and the result is logged.

## Anti-hallucination design (5 points)
1. **The context is closed.** The model receives only the KB articles and the current user's own profile, fetched from the backend with the user's own JWT. The service has no way to request anyone else's data, so it cannot leak it.
2. **Strict structured output.** Every answer is JSON with `status` and `citations:[{slug, quote}]`. Free-form text is not accepted.
3. **Citations are checked by code, not trusted.** A quote must appear **verbatim** in the cited article (after normalizing case, quotes and whitespace). The slug must exist. Every number in the answer must appear in a verified quote. If any check fails, the answer is replaced with a standard "no reliable answer" message. Profile answers cite `profile` and are checked against the profile values.
4. **Two layers of refusal.** A cheap regex pre-filter (prompt injection, other employees' salary/vacation/contacts, "list all employees", "approve my request") runs before the model, and the model has the same rules. Refusals never carry sources.
5. **The assistant never acts.** Vacation and advance intents return a `prefill_request` action. Dates and days (calendar days, inclusive) are recomputed by code and checked against the vacation balance, with a warning if the balance is exceeded. The user reviews the form and submits it. Without an API key or when the API fails, a deterministic search returns the KB section **verbatim** with its source, or `no_answer`, with `mode:"fallback"`. The demo never crashes.

## Layout
`src/assistant.ts` orchestration (`prepare` loads profile, KB and role; `run` is the pipeline) · `src/guard.ts` pre-filter and fixed texts · `src/verify.ts` citation check · `src/llm.ts` shared prompt, model interface, Anthropic client · `src/openai.ts` OpenAI client · `src/models.ts` provider factory · `src/config.ts` env parsing · `src/stream.ts` SSE chunking and pacing · `src/fallback.ts` BM25 · `src/action.ts` dates and actions · `src/profile.ts` own-profile answers · `src/backend/` `BackendClient` (Mock/Real) · `kb/*.md` knowledge base (demo content, fictional ТОО «Jana Post») · `eval/` eval cases and runner · `BACKEND_CONTRACT.md` what the backend must provide.
