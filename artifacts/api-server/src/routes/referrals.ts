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

  const botUsername = process.env.BOT_USERNAME ?? "HustleCoinMinerBot";
  const appShortname = process.env.APP_SHORTNAME ?? "HustleCoin";
  // Use the Mini App direct-link format (?startapp=) so Telegram always injects
  // start_param into tg.initDataUnsafe even when the user already has the bot open.
  // Falls back to legacy ?start= format if shortname is explicitly cleared.
  const referralLink = appShortname
    ? `https://t.me/${botUsername}/${appShortname}?startapp=${telegramId}`
    : `https://t.me/${botUsername}?start=${telegramId}`;

  res.json(
    GetReferralsResponse.parse({
      telegramId,
      referralCode: telegramId,
      referralLink,
      totalReferrals: refs.length,
      totalEarned: refs.reduce((sum, r) => sum + r.referrerHpEarned, 0),
      referrals: referralList,
    })
  );
});

export default router;
