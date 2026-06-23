import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitUserBody, InitUserResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine, checkAndUnlockAchievements, ADMIN_TELEGRAM_ID, WELCOME_BONUS, processReferral } from "../lib/hustlecoin";

const router: IRouter = Router();

router.post("/init", async (req, res): Promise<void> => {
  req.log.info({
    debug_init_raw_body: {
      keys: Object.keys(req.body ?? {}),
      telegramId: req.body?.telegramId,
      referredBy_raw: req.body?.referredBy,
      referredBy_type: typeof req.body?.referredBy,
      initData_present: !!req.body?.initData,
    }
  }, "[REFERRAL_DEBUG] raw request body received");

  const parsed = InitUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, username, firstName, lastName, referredBy } = parsed.data;

  req.log.info({
    debug_init_parsed: {
      telegramId,
      referredBy_parsed: referredBy ?? null,
      referredBy_type: typeof referredBy,
      referredBy_truthy: !!referredBy,
      is_self_referral: referredBy === telegramId,
    }
  }, "[REFERRAL_DEBUG] parsed init body");

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

  req.log.info({
    debug_init_user_lookup: {
      telegramId,
      user_exists: !!user,
      existing_balance: user?.balance ?? null,
    }
  }, "[REFERRAL_DEBUG] user lookup result");

  if (!user) {
    // ── NEW USER ─────────────────────────────────────────────────────────────
    const isAdmin = telegramId === ADMIN_TELEGRAM_ID;
    // Bug #3 fix: write referredBy into the users row at creation time
    [user] = await db
      .insert(usersTable)
      .values({
        telegramId,
        username: username || "user",
        firstName,
        lastName: lastName ?? null,
        isAdmin,
        balance: 0,
        referredBy: referredBy && referredBy !== telegramId ? referredBy : null,
      })
      .returning();

    if (referredBy && referredBy !== telegramId) {
      req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] new user — calling processReferral");

      const result = await processReferral(telegramId, referredBy, 0);

      if (result.credited) {
        // Re-fetch user to get updated balance after reward
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] ✅ new user referral credited via processReferral");
      } else {
        req.log.info(
          { telegramId, referredBy, reason: result.reason },
          "[REFERRAL_DEBUG] referral not credited — granting welcome bonus"
        );
        // Referrer not found or other skip — fall back to welcome bonus
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
      }

    } else {
      // No referral — grant welcome bonus
      req.log.info({
        debug_welcome_branch: {
          telegramId,
          referredBy_value: referredBy ?? null,
          reason: !referredBy ? "referredBy_falsy" : "self_referral",
          bonus: WELCOME_BONUS,
        }
      }, "[REFERRAL_DEBUG] entered WELCOME_BONUS branch — no valid referral code");

      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
    }

  } else {
    // ── EXISTING USER ────────────────────────────────────────────────────────
    if (user.isBanned) {
      res.status(403).json({ error: "Account is banned" });
      return;
    }

    await db.update(usersTable).set({ username: username || user.username, firstName, lastName: lastName ?? null, lastActive: new Date() }).where(eq(usersTable.telegramId, telegramId));
    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

    // SAFETY NET: If referredBy was provided for an existing user, check whether
    // a referral was ever recorded. If not (e.g. webhook created the user but the
    // DB insert for the referral failed), record it now as a second-pass.
    if (referredBy && referredBy !== telegramId) {
      const [existingRef] = await db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, telegramId));
      if (!existingRef) {
        req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] existing user without referral row — attempting second-pass referral");

        // Bug #4 fix: remove the flawed balance-based guard entirely.
        // processReferral's own duplicate-row check (existingRef guard) is the
        // correct and sufficient protection against double-credits.
        const result = await processReferral(telegramId, referredBy, user.balance);

        if (result.credited) {
          [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] ✅ second-pass referral credited");
        } else {
          req.log.info(
            { telegramId, referredBy, reason: result.reason },
            "[REFERRAL_DEBUG] second-pass referral skipped"
          );
        }
      }
    }
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
