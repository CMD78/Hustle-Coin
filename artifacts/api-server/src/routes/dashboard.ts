import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, achievementsTable, achievementUnlocksTable, questProgressTable, questsTable, taskCompletionsTable, tasksTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine } from "../lib/hustlecoin";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const parsed = GetDashboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))).length;
  const achievementUnlocks = await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, telegramId));
  const achievementCount = achievementUnlocks.length;
  const badges = getBadges({ referralCount, streak: user.streak, balance: user.balance, totalMines: user.totalMines });
  const mineCountdown = getMineCountdown(user.lastMine);

  const rankResult = await db.execute(sql`SELECT COUNT(*) + 1 as rank FROM ${usersTable} WHERE balance > ${user.balance}`);
  const rank = parseInt(String((rankResult.rows[0] as { rank: string }).rank), 10);

  const quests = await db.select().from(questsTable);
  const questsCompleted = await Promise.all(
    quests.map(async (q) => {
      const [p] = await db.select().from(questProgressTable).where(and(eq(questProgressTable.questId, q.id), eq(questProgressTable.telegramId, telegramId), eq(questProgressTable.date, today)));
      return p?.completed ? 1 : 0;
    })
  );
  const completedCount = questsCompleted.reduce((a, b) => a + b, 0);

  const activeTasksCount = (await db.select().from(tasksTable).where(eq(tasksTable.status, "active"))).length;

  const unlockIds = achievementUnlocks.map((u) => u.achievementId);
  const achievementDefs = unlockIds.length > 0 ? await db.select().from(achievementsTable).where(inArray(achievementsTable.id, unlockIds)) : [];
  const achievementDefMap = new Map(achievementDefs.map((a) => [a.id, a]));
  const recentAchievements = achievementUnlocks.slice(-3).map((u) => {
    const def = achievementDefMap.get(u.achievementId);
    return {
      id: u.id,
      title: def?.title ?? "Achievement",
      description: def?.description ?? "",
      icon: def?.icon ?? "🏅",
      unlocked: true,
      unlockedAt: u.unlockedAt.toISOString(),
    };
  });

  res.json(
    GetDashboardResponse.parse({
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName ?? null,
        balance: user.balance,
        level: getLevel(user.balance),
        streak: user.streak,
        totalMines: user.totalMines,
        lastMine: user.lastMine?.toISOString() ?? null,
        canMine: canMine(user.lastMine),
        mineCountdown,
        referralCount,
        achievementCount,
        joinDate: user.joinDate.toISOString(),
        rank,
        badges,
      },
      questsCompleted: completedCount,
      questsTotal: quests.length,
      activeTasksCount,
      recentAchievements,
    })
  );
});

export default router;
