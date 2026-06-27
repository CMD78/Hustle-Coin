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
  const appShortname = process.env.APP_SHORTNAME ?? null;

  if (!appShortname) {
    console.error(
      "[CONFIG ERROR] APP_SHORTNAME is not set. " +
      "Referral links will fall back to the legacy ?start= bot format, which does NOT inject " +
      "start_param into tg.initDataUnsafe — referrals will never be credited. " +
      "Set APP_SHORTNAME to the exact Mini App shortname registered in BotFather " +
      "(the part after t.me/BOT_USERNAME/ in your Mini App link)."
    );
  }

  // Use the Mini App direct-link format (?startapp=) when APP_SHORTNAME is configured so
  // Telegram always injects start_param into tg.initDataUnsafe.
  // Falls back to legacy ?start= bot format when APP_SHORTNAME is not set — note that
  // this fallback does NOT deliver start_param to the Mini App and referrals will not work.
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
