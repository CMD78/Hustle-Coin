import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetReferralsQueryParams, GetReferralsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/referrals", async (req, res): Promise<void> => {
  const parsed = GetReferralsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId } = parsed.data;
  const refs = await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId));

  const referralList = await Promise.all(
    refs.map(async (r) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, r.refereeTelegramId));
      return {
        telegramId: r.refereeTelegramId,
        username: user?.username ?? "unknown",
        firstName: user?.firstName ?? "Unknown",
        joinDate: user?.joinDate.toISOString() ?? r.createdAt.toISOString(),
        hpEarned: r.referrerHpEarned,
      };
    })
  );

  res.json(
    GetReferralsResponse.parse({
      telegramId,
      referralCode: telegramId,
      referralLink: `https://t.me/${process.env.BOT_USERNAME ?? "HustleCoinMinerBot"}?start=${telegramId}`,
      totalReferrals: refs.length,
      totalEarned: refs.reduce((sum, r) => sum + r.referrerHpEarned, 0),
      referrals: referralList,
    })
  );
});

export default router;
