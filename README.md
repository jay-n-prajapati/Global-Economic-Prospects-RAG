# task-2

RAG project scaffold with the same infrastructure as task-1: Next.js 16 + shadcn, Postgres/pgvector, Drizzle, Gemini.
The application itself is not built yet; see `specs/` and `CLAUDE.md`.

## Setup
1. `cp .env.example .env.local` and set `GEMINI_API_KEY` (and change the Postgres password; keep `DATABASE_URL` in sync).
2. `docker compose --env-file .env.local up -d db` (Postgres + pgvector on `localhost:5432`).
3. `npm install`
4. Define tables in `src/lib/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.
5. `npm run dev`

## Full stack in Docker
`docker compose --env-file .env.local up -d --build` serves the app on `localhost:3000`
(ports come from `APP_PORT` / `DB_PORT`; change them if another stack, such as task-1, is running).

## Scripts
`dev`, `build`, `start`, `lint`, `db:generate`, `db:migrate`.
