# CLAUDE.md

Task 2 RAG project (purpose to be defined in `specs/`). Same infra as task-1: Next.js 16 + shadcn (base-maia), Postgres/pgvector, Drizzle, Gemini (`@google/genai`).

## Workflow (follow this every session)
1. Read `specs/decisions.md` first. Do not re-litigate decided items.
2. Work from `specs/<feature>/spec.md` and `plan.md`; update `progress.md` after each session.
3. Append to `specs/decisions.md` whenever a decision is made, and flag any case where the user chose something other than the recommended option as **OVERRIDE**. Never rewrite old rows; supersede them with a new row.
4. Unresolved decisions: ask the user with options and a recommendation, one question at a time (the user is learning RAG, so explain tradeoffs).

## Dev
- DB: `docker compose --env-file .env.local up -d db` (host port `DB_PORT`, default 5432); app: `npm run dev` on the host.
- Only one of the sibling stacks (task-1, task-2, task-3) can run on the default ports at a time (stop one with `docker compose --env-file .env.local down`, or override `DB_PORT` / `APP_PORT`).
- Full stack: `docker compose --env-file .env.local up -d --build` (app on `APP_PORT`, default 3000).
- Env lives in `.env.local` (git-ignored; `.env.example` is the template). Compose reads `.env`, so pass `--env-file`.
- Schema changes go through Drizzle migrations (`npm run db:generate`, `npm run db:migrate`), not edits to `db/init.sql` (that only enables the `vector` extension).
- Scripts run on the host with `tsx` (`.mts` files, since the package is CommonJS); the production image carries no dev tooling.

## Constraints
- Resource-friendly containers (db 384m, app 256m); keep dependencies minimal.
- Free-tier Gemini quotas are small (embeddings ~100 requests/min, chat ~20/day); retry honors the server's `retryDelay`.
