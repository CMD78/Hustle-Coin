---
name: HustleCoin Referral System Architecture
description: Key decisions and failure modes for the referral tracking system — read before touching referral logic.
---

## Rule
`processReferral()` in `hustlecoin.ts` is the SINGLE source of truth. Never inline referral logic anywhere else.

**Why:** Previous bugs came from three separate inline implementations diverging — webhook, /api/init, and /telegram/start each had slightly different logic.

## Critical Fix — DB referredBy fallback
`init.ts` second-pass MUST check `user.referredBy` from the DB even when the frontend sends no `referredBy`.

**Why:** When user is created via webhook (/start command), `referredBy` is written to the DB column. If the user later opens the app via the menu button (no start_param), the frontend sends no `referredBy`, so without the DB fallback the second-pass never fires and the referral is lost silently.

**How to apply:** In the existing-user branch of `/api/init`, use:
```
effectiveReferredBy = requestReferredBy || user.referredBy (from DB)
```

## processReferral() design
- Removes `refereeCurrentBalance` param — fetches from DB directly (no stale-value risk)
- Uses atomic SQL increments (`balance + REWARD`) to prevent read-modify-write races
- Catches DB unique constraint violations on insert (race condition safety net)
- referrals.referee_telegram_id has a DB-level UNIQUE constraint — hard backstop

## referralStatus field
`InitUserResponse` includes `referralStatus` string. The frontend uses it to decide whether to clear `hc_pending_referral` from localStorage.
- CLEAR: "credited", "skipped_duplicate", "welcome_bonus_only", "no_referral", "skipped_self*", "skipped_invalid*", "skipped_race_condition*"
- KEEP: "skipped_referrer_not_found" — referrer may join DB later; next launch retries second-pass

## Referral link format
Always use `?startapp=USER_ID` (Mini App direct link), NOT `?start=USER_ID` (bot command).
`?start=` only re-fires `/start` command if user doesn't already have bot chat open.
`?startapp=` ALWAYS injects `start_param` into `tg.initDataUnsafe` regardless.

## Diagnostic endpoint
`GET /api/admin/referral-debug/:telegramId?adminTelegramId=ADMIN_ID`
Returns user record, referral rows (as referee and referrer), dry-run outcome, and exact failure reason.
