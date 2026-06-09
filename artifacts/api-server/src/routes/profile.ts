import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, achievementUnlocksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetProfileQueryParams, GetProfileResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine, ADMIN_TELEGRAM_ID } from "../lib/hustlecoin";

const router: IRouter = Router();

router.get("/profile", async (req, res): Promise<void> => {
  const parsed = GetProfileQueryParams.safeParse(req.query);
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

  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))).length;
  const achievementCount = (await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, telegramId))).length;
  const badges = getBadges({ referralCount, streak: user.streak, balance: user.balance, totalMines: user.totalMines });
  const mineCountdown = getMineCountdown(user.lastMine);

  const rankResult = await db.execute(sql`SELECT COUNT(*) + 1 as rank FROM ${usersTable} WHERE balance > ${user.balance}`);
  const rank = parseInt(String((rankResult.rows[0] as { rank: string }).rank), 10);

  res.json(
    GetProfileResponse.parse({
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
    })
  );
});

export default router;
