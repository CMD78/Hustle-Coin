---
name: Referral refactor — 2026-06-26
description: Details of the atomic referral system redesign and known quirks.
---

## What was built
- `referral_events` table: audit log of every referral step (link_opened, referrer_stored, completed, duplicate_referral, missing_referrer, rejected)
- `processReferral()` now wraps the duplicate check + referrer check + referee check + insert + balance updates inside one `db.transaction()`, making rewards atomic
- `logReferralEvent()` exported from hustlecoin.ts; always called OUTSIDE the transaction so events persist on rollback
- `POST /api/admin/repair-referral` — credits a missed referral for any two existing users
- `GET /api/admin/referral-debug/:telegramId` — enhanced with referral_events query
- Second-pass (existing user retry) lives ONLY in init.ts; removed from webhook and /telegram/start to eliminate duplicate processing
- Test suite: `pnpm --filter @workspace/scripts test-referrals` — 10 scenarios, all pass

## Drizzle unique-violation wrapping quirk
When a PostgreSQL unique constraint (code 23505) fires inside a `db.transaction()` callback, Drizzle wraps it in a "Failed query: insert into ..." Error. The original PG error is nested inside `err.cause`. Detection must walk the chain:

```ts
const isUniqueViolation = (e: any): boolean => {
  if (!e) return false;
  if (e.code === "23505") return true;
  if (String(e.message ?? "").toLowerCase().includes("unique")) return true;
  return isUniqueViolation(e.cause);  // recurse!
};
```

Without the `.cause` recursion, concurrent race conditions throw 500 instead of gracefully returning `{ credited: false, reason: "race_condition_duplicate" }`.

**Why:** Drizzle 0.45.x wraps PG errors in its own Error class rather than re-throwing the raw PG error.

## Quest rewards offset balance assertions
`updateQuestProgress("invite_friend")` runs AFTER the transaction and may add a quest reward (e.g. 25 HC) to the referrer's balance. Balance assertions for the referrer should use `>= base + REFERRER_REWARD`, not `=== base + REFERRER_REWARD`.

## DB schema note
`referral_events` was created with raw SQL (`CREATE TABLE IF NOT EXISTS`) rather than `drizzle-kit push` because the push detected unrelated pre-existing schema drift (missing_session_start, status columns) that would have caused data loss. The Drizzle schema file defines the table correctly for future syncs.
