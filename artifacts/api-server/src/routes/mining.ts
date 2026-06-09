import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, referralsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { MineHpBody, MineHpResponse, GetMineHistoryQueryParams, GetMineHistoryResponse } from "@workspace/api-zod";
import { getLevel, getStreakBonus, canMine, getMineCountdown, checkAndUnlockAchievements, updateQuestProgress, BASE_MINE_HP } from "../lib/hustlecoin";

const router: IRouter = Router();

router.post("/mine", async (req, res): Promise<void> => {
  const parsed = MineHpBody.safeParse(req.body);
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

  if (user.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }

  if (!canMine(user.lastMine)) {
    const mineCountdown = getMineCountdown(user.lastMine);
    const nextMineAt = user.lastMine ? new Date(user.lastMine.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    res.status(400).json(
      MineHpResponse.parse({
        success: false,
        hpEarned: 0,
        bonusHp: 0,
        newBalance: user.balance,
        streak: user.streak,
        message: `You can mine again in ${Math.floor((mineCountdown ?? 0) / 3600)}h ${Math.floor(((mineCountdown ?? 0) % 3600) / 60)}m`,
        nextMineAt,
      })
    );
    return;
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const newStreak = user.lastMine && user.lastMine >= yesterday ? user.streak + 1 : 1;

  const baseHp = BASE_MINE_HP;
  const bonusHp = getStreakBonus(newStreak);
  const totalHp = baseHp + bonusHp;
  const newBalance = user.balance + totalHp;

  await db.update(usersTable).set({
    balance: newBalance,
    streak: newStreak,
    totalMines: user.totalMines + 1,
    lastMine: now,
    level: getLevel(newBalance),
    lastActive: now,
  }).where(eq(usersTable.telegramId, telegramId));

  await db.insert(miningLogsTable).values({ telegramId, hpEarned: baseHp, bonusHp, streak: newStreak });

  await updateQuestProgress(telegramId, "mine");

  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))).length;
  const rankResult = await db.execute(sql`SELECT COUNT(*) + 1 as rank FROM ${usersTable} WHERE balance > ${newBalance}`);
  const rank = parseInt(String((rankResult.rows[0] as { rank: string }).rank), 10);
  await checkAndUnlockAchievements(telegramId, newBalance, newStreak, user.totalMines + 1, referralCount, rank);

  let message = `+${baseHp} HC mined!`;
  if (bonusHp > 0) message += ` +${bonusHp} HC streak bonus (${newStreak} day streak)!`;

  res.json(
    MineHpResponse.parse({
      success: true,
      hpEarned: baseHp,
      bonusHp,
      newBalance,
      streak: newStreak,
      message,
      nextMineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
  );
});

router.get("/mine/history", async (req, res): Promise<void> => {
  const parsed = GetMineHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, limit } = parsed.data;
  const logs = await db
    .select()
    .from(miningLogsTable)
    .where(eq(miningLogsTable.telegramId, telegramId))
    .orderBy(desc(miningLogsTable.minedAt))
    .limit(limit ?? 20);

  res.json(
    GetMineHistoryResponse.parse(
      logs.map((l) => ({
        id: l.id,
        telegramId: l.telegramId,
        hpEarned: l.hpEarned,
        bonusHp: l.bonusHp,
        streak: l.streak,
        minedAt: l.minedAt.toISOString(),
      }))
    )
  );
});

export default router;
