# HustleCoin Mini App

A Telegram Mini App where users earn HP coins by daily mining, completing tasks, inviting friends, maintaining streaks, and climbing leaderboards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/hustle-coin run dev` — run the frontend (port 23063)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter + Framer Motion (Telegram Mini App)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Database tables (users, referrals, mining_logs, tasks, task_completions, achievements, achievement_unlocks, quests, quest_progress, feedback, admin_logs, announcements, settings)
- `artifacts/api-server/src/routes/` — Route handlers per domain
- `artifacts/api-server/src/lib/hustlecoin.ts` — Core game logic (levels, streaks, badges, achievements)
- `artifacts/hustle-coin/src/` — React frontend (Telegram Mini App)

## Architecture decisions

- PostgreSQL instead of SQLite — production-ready, provisioned by Replit
- Node.js/Express instead of Python Flask — matches existing monorepo stack
- Telegram WebApp SDK loaded via script tag in index.html; init data parsed in TelegramProvider
- Admin access gated by `ADMIN_TELEGRAM_ID = '7035629762'` in `artifacts/api-server/src/lib/hustlecoin.ts`
- 24-hour mining cooldown enforced server-side; client shows countdown from `mineCountdown` seconds

## Product

HustleCoin lets Telegram users earn HP coins by daily mining (+100 HP base + streak bonuses), completing social tasks, inviting friends (+500 HP referrer, +250 HP referee), and tracking progress on leaderboards. Achievements unlock automatically based on milestones.

## User preferences

- Admin Telegram ID: 7035629762 (Yahuza_78 / CMD😎)
- Do NOT reset or overwrite existing user data
- Preserve all balances, referrals, mining records, achievements

## Gotchas

- Run `pnpm run typecheck:libs` after any schema change in `lib/db/` before typechecking the API server
- Admin Telegram ID is hardcoded in `artifacts/api-server/src/lib/hustlecoin.ts` as `ADMIN_TELEGRAM_ID`
- After any OpenAPI spec change, run codegen before touching frontend or server code
- The app shows a splash screen then requires Telegram WebApp init data — must be opened inside Telegram to fully load

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
