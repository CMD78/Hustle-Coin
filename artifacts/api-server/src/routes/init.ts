import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitUserBody, InitUserResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine, checkAndUnlockAchievements, updateQuestProgress, ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS } from "../lib/hustlecoin";

const router: IRouter = Router();

router.post("/init", async (req, res): Promise<void> => {
  const parsed = InitUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, username, firstName, lastName, referredBy } = parsed.data;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

  if (!user) {
    const isAdmin = telegramId === ADMIN_TELEGRAM_ID;
    [user] = await db
      .insert(usersTable)
      .values({ telegramId, username, firstName, lastName: lastName ?? null, isAdmin, balance: 0 })
      .returning();

    if (referredBy && referredBy !== telegramId) {
      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, referredBy));
      if (referrer) {
        const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, telegramId));
        if (!existing) {
          await db.insert(referralsTable).values({
            referrerTelegramId: referredBy,
            refereeTelegramId: telegramId,
            referrerHpEarned: REFERRER_REWARD,
            refereeHpEarned: REFEREE_REWARD,
          });
          await db.update(usersTable).set({ balance: referrer.balance + REFERRER_REWARD }).where(eq(usersTable.telegramId, referredBy));
          await db.update(usersTable).set({ balance: user.balance + REFEREE_REWARD }).where(eq(usersTable.telegramId, telegramId));
          [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          await updateQuestProgress(referredBy, "invite_friend");
          await checkAndUnlockAchievements(
            referredBy,
            referrer.balance + REFERRER_REWARD,
            referrer.streak,
            referrer.totalMines,
            (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, referredBy))).length,
            null
          );
        }
      }
    } else {
      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
    }
  } else {
    if (user.isBanned) {
      res.status(403).json({ error: "Account is banned" });
      return;
    }
    await db.update(usersTable).set({ username, firstName, lastName: lastName ?? null, lastActive: new Date() }).where(eq(usersTable.telegramId, telegramId));
    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  }

  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))).length;
  const badges = getBadges({ referralCount, streak: user.streak, balance: user.balance, totalMines: user.totalMines });

  await checkAndUnlockAchievements(telegramId, user.balance, user.streak, user.totalMines, referralCount, null);

  const mineCountdown = getMineCountdown(user.lastMine);

  res.json(
    InitUserResponse.parse({
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
      achievementCount: 0,
      joinDate: user.joinDate.toISOString(),
      rank: null,
      badges,
    })
  );
});

export default router;
