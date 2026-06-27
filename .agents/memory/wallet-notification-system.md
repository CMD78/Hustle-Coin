---
name: Wallet Dashboard + Notification System
description: Architecture decisions for transaction recording, notification delivery, and wallet stats computation
---

## Transaction Recording (`recordTransaction`)
- Best-effort, never throws. Called OUTSIDE db.transaction() to always persist.
- Exported from `artifacts/api-server/src/lib/hustlecoin.ts`
- Writes to `transactions` table (Drizzle schema at `lib/db/src/schema/transactions.ts`)
- Types: `mining`, `referral_reward`, `referral_bonus`, `welcome_bonus`, `task_reward`, `achievement_reward`, `quest_reward`, `admin_grant`, `admin_deduction`, `adjustment`
- Hooked into: `processReferral`, `checkAndUnlockAchievements` (via `updateQuestProgress`), `mining.ts` (POST /mine), `init.ts` (welcome bonus), `admin.ts` (grant-hp)

## Notification Creation (`createNotification`)
- Best-effort, never throws. Writes to `notifications` table.
- Exported from `artifacts/api-server/src/lib/hustlecoin.ts`
- Types: `referral_reward`, `referral_joined`, `achievement_unlocked`, `wallet_credit`, `wallet_adjustment`, `admin_announcement`, `mining_ready`, `task_approved`
- Hooked into: same call sites as recordTransaction

## Wallet Stats Strategy
- `/api/wallet` computes stats from SOURCE TABLES (mining_logs, task_completions, referrals) for historical accuracy — never relies on transactions table for stats
- `/api/wallet/history` queries transactions table (going-forward records only; total=0 until new transactions occur)
- This avoids double-counting: transactions table has new records; source tables have all history

**Why:** The transactions table is append-only going forward. Historical data lives in the original normalized tables. The wallet dashboard must show accurate totals from source tables regardless of when transaction recording started.

## Notification Bell in Layout
- Polls `/api/notifications/unread-count` every 60 seconds
- Badge shows count in top-right corner, fixed position (z-50), links to /notifications
- `pt-5` on main content to avoid overlap with bell

## New Routes Mounted
- `/api/notifications` (GET, POST /:id/read, POST /read-all, DELETE /:id, GET /unread-count, GET /settings, PUT /settings)
- `/api/admin/notify` (POST — broadcast to one user or all)
- `/api/wallet/history` (GET — paginated, filterable)
- Router index: `artifacts/api-server/src/routes/index.ts` imports `notificationsRouter`

## Frontend Routes Added
- `/notifications` → `pages/notifications.tsx`
- `/notification-settings` → `pages/notification-settings.tsx`
