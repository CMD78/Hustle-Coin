import { db, usersTable, referralsTable, achievementsTable, achievementUnlocksTable, questProgressTable, questsTable, referralEventsTable, transactionsTable, notificationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

export const LEVEL_THRESHOLDS = [0, 500, 1000, 2500, 5000, 10000, 25000, 50000];
export const ADMIN_TELEGRAM_ID = "7035629762";

export const BASE_MINE_HP = 100;
export const REFERRER_REWARD = 500;
export const REFEREE_REWARD = 250;
export const WELCOME_BONUS = 250;

export function getLevel(balance: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (balance >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

export function getStreakBonus(streak: number): number {
  if (streak >= 30) return 200;
  if (streak >= 7) return 50;
  if (streak >= 3) return 10;
  return 0;
}

export function getMineCountdown(lastMine: Date | null): number | null {
  if (!lastMine) return null;
  const cooldownMs = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - lastMine.getTime();
  const remaining = cooldownMs - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

export function canMine(lastMine: Date | null): boolean {
  if (!lastMine) return true;
  const cooldownMs = 24 * 60 * 60 * 1000;
  return Date.now() - lastMine.getTime() >= cooldownMs;
}

export function getBadges(user: { referralCount: number; streak: number; balance: number; totalMines: number }): string[] {
  const badges: string[] = ["🏅 Early Supporter"];
  if (user.referralCount >= 1) badges.push("👥 First Referral");
  if (user.referralCount >= 5) badges.push("🤝 Community Builder");
  if (user.referralCount >= 10) badges.push("🏆 Top Referrer");
  if (user.referralCount >= 50) badges.push("⭐ Referral Legend");
  if (user.streak >= 7) badges.push("🔥 Streak Master");
  if (user.streak >= 30) badges.push("💫 Streak Legend");
  if (user.balance >= 5000) badges.push("💎 Elite Hustler");
  if (user.balance >= 25000) badges.push("👑 HC Whale");
  if (user.totalMines >= 30) badges.push("⛏️ Top Miner");
  return badges;
}

// ── Transaction Recorder ──────────────────────────────────────────────────────
// Best-effort: never throws. Called outside transactions to always persist.
export async function recordTransaction(tx: {
  telegramId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  relatedId?: string | null;
}): Promise<void> {
  try {
    await db.insert(transactionsTable).values({
      telegramId: tx.telegramId,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      relatedId: tx.relatedId ?? null,
    });
  } catch (err) {
    logger.error({ err, tx }, "[TRANSACTION] failed to record (non-fatal)");
  }
}

// ── Notification Creator ──────────────────────────────────────────────────────
// Best-effort: never throws.
export async function createNotification(notif: {
  telegramId: string;
  title: string;
  message: string;
  type: string;
  relatedEntity?: string | null;
}): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      telegramId: notif.telegramId,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      relatedEntity: notif.relatedEntity ?? null,
    });
  } catch (err) {
    logger.error({ err, notif }, "[NOTIFICATION] failed to create (non-fatal)");
  }
}

// ── Referral Event Logger ─────────────────────────────────────────────────────
export async function logReferralEvent(event: {
  referrerTelegramId?: string | null;
  refereeTelegramId: string;
  step: string;
  result: string;
  message?: string | null;
  source?: string | null;
}): Promise<void> {
  try {
    await db.insert(referralEventsTable).values({
      referrerTelegramId: event.referrerTelegramId ?? null,
      refereeTelegramId: event.refereeTelegramId,
      step: event.step,
      result: event.result,
      message: event.message ?? null,
      source: event.source ?? null,
    });
  } catch (err) {
    logger.error({ err, event }, "[REFERRAL_EVENT] failed to log event (non-fatal)");
  }
}

class ReferralSkipError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "ReferralSkipError";
  }
}

// ── Centralized Referral Processor ───────────────────────────────────────────
export async function processReferral(
  refereeTelegramId: string,
  referrerTelegramId: string,
  source: string = "init",
): Promise<{ credited: boolean; reason?: string }> {
  const logCtx = { refereeTelegramId, referrerTelegramId, source };

  if (!referrerTelegramId || !refereeTelegramId || referrerTelegramId === refereeTelegramId) {
    logger.info(logCtx, "[REFERRAL] skipped — invalid or self-referral");
    await logReferralEvent({
      referrerTelegramId,
      refereeTelegramId,
      step: "rejected",
      result: "skipped",
      message: "invalid_or_self_referral",
      source,
    });
    return { credited: false, reason: "invalid_or_self_referral" };
  }

  let skipReason: string | null = null;
  let referrerBalanceBefore = 0;
  let refereeBalanceBefore  = 0;

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: referralsTable.id, referrerTelegramId: referralsTable.referrerTelegramId })
        .from(referralsTable)
        .where(eq(referralsTable.refereeTelegramId, refereeTelegramId));

      if (existing) {
        skipReason = "duplicate_row_exists";
        throw new ReferralSkipError(skipReason);
      }

      const [referrer] = await tx
        .select({ telegramId: usersTable.telegramId, balance: usersTable.balance, streak: usersTable.streak, totalMines: usersTable.totalMines })
        .from(usersTable)
        .where(eq(usersTable.telegramId, referrerTelegramId));

      if (!referrer) {
        skipReason = "referrer_not_found";
        throw new ReferralSkipError(skipReason);
      }
      referrerBalanceBefore = referrer.balance;

      const [referee] = await tx
        .select({ telegramId: usersTable.telegramId, balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.telegramId, refereeTelegramId));

      if (!referee) {
        skipReason = "referee_not_found";
        throw new ReferralSkipError(skipReason);
      }
      refereeBalanceBefore = referee.balance;

      await tx.insert(referralsTable).values({
        referrerTelegramId,
        refereeTelegramId,
        referrerHpEarned: REFERRER_REWARD,
        refereeHpEarned: REFEREE_REWARD,
      });

      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${REFERRER_REWARD}` })
        .where(eq(usersTable.telegramId, referrerTelegramId));

      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${REFEREE_REWARD}` })
        .where(eq(usersTable.telegramId, refereeTelegramId));
    });
  } catch (err: any) {
    if (err instanceof ReferralSkipError) {
      const reason = skipReason!;
      const step =
        reason === "duplicate_row_exists" ? "duplicate_referral"
        : reason === "referrer_not_found" ? "missing_referrer"
        : "rejected";
      logger.info({ ...logCtx, reason }, `[REFERRAL] skipped — ${reason}`);
      await logReferralEvent({ referrerTelegramId, refereeTelegramId, step, result: "skipped", message: reason, source });
      return { credited: false, reason };
    }

    const isUniqueViolation = (e: any): boolean => {
      if (!e) return false;
      if (e.code === "23505") return true;
      const msg = String(e.message ?? "").toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate key")) return true;
      const detail = String(e.detail ?? "").toLowerCase();
      if (detail.includes("already exists")) return true;
      return isUniqueViolation(e.cause);
    };

    if (isUniqueViolation(err)) {
      logger.warn(logCtx, "[REFERRAL] DB unique constraint — concurrent race condition");
      await logReferralEvent({
        referrerTelegramId,
        refereeTelegramId,
        step: "duplicate_referral",
        result: "skipped",
        message: "race_condition_duplicate — DB unique constraint fired",
        source,
      });
      return { credited: false, reason: "race_condition_duplicate" };
    }

    logger.error({ ...logCtx, err }, "[REFERRAL] unexpected error in transaction");
    await logReferralEvent({
      referrerTelegramId,
      refereeTelegramId,
      step: "rejected",
      result: "failed",
      message: String(err?.message ?? err),
      source,
    });
    throw err;
  }

  // ── Transaction committed — record side effects outside the transaction ────
  logger.info(
    {
      referrer: referrerTelegramId,
      referee: refereeTelegramId,
      referrer_balance_before: referrerBalanceBefore,
      referrer_balance_after: referrerBalanceBefore + REFERRER_REWARD,
      referee_balance_before: refereeBalanceBefore,
      referee_balance_after: refereeBalanceBefore + REFEREE_REWARD,
      source,
    },
    "[REFERRAL] ✅ credited — balances updated atomically in transaction"
  );
  await logReferralEvent({
    referrerTelegramId,
    refereeTelegramId,
    step: "completed",
    result: "success",
    message: `referrer +${REFERRER_REWARD} HC, referee +${REFEREE_REWARD} HC`,
    source,
  });

  await recordTransaction({
    telegramId: referrerTelegramId,
    type: "referral_reward",
    amount: REFERRER_REWARD,
    balanceBefore: referrerBalanceBefore,
    balanceAfter: referrerBalanceBefore + REFERRER_REWARD,
    description: `Referral reward — invited user`,
    relatedId: refereeTelegramId,
  });

  await recordTransaction({
    telegramId: refereeTelegramId,
    type: "referral_bonus",
    amount: REFEREE_REWARD,
    balanceBefore: refereeBalanceBefore,
    balanceAfter: refereeBalanceBefore + REFEREE_REWARD,
    description: `Referral bonus — joined via referral link`,
    relatedId: referrerTelegramId,
  });

  await createNotification({
    telegramId: referrerTelegramId,
    title: "Referral Reward! 🎉",
    message: `You earned +${REFERRER_REWARD} HC for inviting a new user to HustleCoin!`,
    type: "referral_reward",
    relatedEntity: refereeTelegramId,
  });

  await createNotification({
    telegramId: refereeTelegramId,
    title: "Welcome Bonus! 🎁",
    message: `You earned +${REFEREE_REWARD} HC for joining via a referral link.`,
    type: "referral_joined",
    relatedEntity: referrerTelegramId,
  });

  // ── Side effects (non-critical) ───────────────────────────────────────────
  try {
    const referralCount = (
      await db.select({ id: referralsTable.id })
        .from(referralsTable)
        .where(eq(referralsTable.referrerTelegramId, referrerTelegramId))
    ).length;
    const [updatedReferrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, referrerTelegramId));
    if (updatedReferrer) {
      await updateQuestProgress(referrerTelegramId, "invite_friend");
      await checkAndUnlockAchievements(
        referrerTelegramId,
        updatedReferrer.balance,
        updatedReferrer.streak,
        updatedReferrer.totalMines,
        referralCount,
        null,
      );
    }
  } catch (sideErr) {
    logger.error({ ...logCtx, err: sideErr }, "[REFERRAL] side-effect error (non-fatal)");
  }

  return { credited: true };
}

export async function checkAndUnlockAchievements(
  telegramId: string,
  balance: number,
  streak: number,
  totalMines: number,
  referralCount: number,
  rank: number | null
): Promise<void> {
  try {
    const allAchievements = await db.select().from(achievementsTable);
    const unlocked = await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, telegramId));
    const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

    for (const achievement of allAchievements) {
      if (unlockedIds.has(achievement.id)) continue;

      let shouldUnlock = false;
      switch (achievement.title) {
        case "First Mine":
          shouldUnlock = totalMines >= 1;
          break;
        case "First Referral":
          shouldUnlock = referralCount >= 1;
          break;
        case "10 Referrals":
          shouldUnlock = referralCount >= 10;
          break;
        case "50 Referrals":
          shouldUnlock = referralCount >= 50;
          break;
        case "7 Day Streak":
          shouldUnlock = streak >= 7;
          break;
        case "30 Day Streak":
          shouldUnlock = streak >= 30;
          break;
        case "1000 HP Club":
          shouldUnlock = balance >= 1000;
          break;
        case "Early Supporter":
          shouldUnlock = true;
          break;
        case "Top 10 Leaderboard":
          shouldUnlock = rank !== null && rank <= 10;
          break;
        case "5000 HP Holder":
          shouldUnlock = balance >= 5000;
          break;
        case "Elite Holder":
          shouldUnlock = balance >= 25000;
          break;
      }

      if (shouldUnlock) {
        await db.insert(achievementUnlocksTable).values({ achievementId: achievement.id, telegramId });
        await createNotification({
          telegramId,
          title: `Achievement Unlocked! 🏆`,
          message: `You unlocked "${achievement.title}"${achievement.description ? ` — ${achievement.description}` : ""}`,
          type: "achievement_unlocked",
          relatedEntity: String(achievement.id),
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Error checking achievements");
  }
}

export async function updateQuestProgress(telegramId: string, questType: string): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const quests = await db.select().from(questsTable).where(eq(questsTable.questType, questType));

    for (const quest of quests) {
      const [existing] = await db
        .select()
        .from(questProgressTable)
        .where(and(eq(questProgressTable.questId, quest.id), eq(questProgressTable.telegramId, telegramId), eq(questProgressTable.date, today)));

      if (!existing) {
        const isComplete = 1 >= quest.target;
        await db.insert(questProgressTable).values({
          questId: quest.id,
          telegramId,
          progress: 1,
          completed: isComplete ? 1 : 0,
          date: today,
        });
        if (isComplete) {
          const [u] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          if (u) {
            const newBal = u.balance + quest.reward;
            await db.update(usersTable).set({ balance: newBal }).where(eq(usersTable.telegramId, telegramId));
            await recordTransaction({
              telegramId,
              type: "quest_reward",
              amount: quest.reward,
              balanceBefore: u.balance,
              balanceAfter: newBal,
              description: `Quest reward — ${quest.title}`,
              relatedId: String(quest.id),
            });
          }
        }
      } else if (!existing.completed) {
        const newProgress = existing.progress + 1;
        const isNowComplete = newProgress >= quest.target;
        await db
          .update(questProgressTable)
          .set({ progress: newProgress, completed: isNowComplete ? 1 : 0 })
          .where(eq(questProgressTable.id, existing.id));
        if (isNowComplete) {
          const [u] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          if (u) {
            const newBal = u.balance + quest.reward;
            await db.update(usersTable).set({ balance: newBal }).where(eq(usersTable.telegramId, telegramId));
            await recordTransaction({
              telegramId,
              type: "quest_reward",
              amount: quest.reward,
              balanceBefore: u.balance,
              balanceAfter: newBal,
              description: `Quest reward — ${quest.title}`,
              relatedId: String(quest.id),
            });
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Error updating quest progress");
  }
}
