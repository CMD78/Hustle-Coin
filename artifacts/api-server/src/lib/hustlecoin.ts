import { db, usersTable, achievementsTable, achievementUnlocksTable, questProgressTable, questsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
        await db.insert(questProgressTable).values({
          questId: quest.id,
          telegramId,
          progress: 1,
          completed: 1 >= quest.target ? 1 : 0,
          date: today,
        });
      } else if (!existing.completed) {
        const newProgress = existing.progress + 1;
        await db
          .update(questProgressTable)
          .set({ progress: newProgress, completed: newProgress >= quest.target ? 1 : 0 })
          .where(eq(questProgressTable.id, existing.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Error updating quest progress");
  }
}
