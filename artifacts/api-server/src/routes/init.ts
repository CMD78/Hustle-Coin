import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitUserBody, InitUserResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine, checkAndUnlockAchievements, updateQuestProgress, ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS } from "../lib/hustlecoin";

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
    [user] = await db
      .insert(usersTable)
      .values({ telegramId, username, firstName, lastName: lastName ?? null, isAdmin, balance: 0 })
      .returning();

    if (referredBy && referredBy !== telegramId) {
      req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] new user — entering referral branch");

      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, referredBy));

      req.log.info({
        debug_referrer_lookup: {
          referredBy,
          referrer_found: !!referrer,
          referrer_balance: referrer?.balance ?? null,
        }
      }, "[REFERRAL_DEBUG] referrer lookup result");

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
          await db.update(usersTable).set({ balance: REFEREE_REWARD }).where(eq(usersTable.telegramId, telegramId));
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

          req.log.info({
            debug_referral_credited: {
              referredBy,
              telegramId,
              referrer_reward: REFERRER_REWARD,
              referee_reward: REFEREE_REWARD,
              referrer_new_balance: referrer.balance + REFERRER_REWARD,
              referee_new_balance: REFEREE_REWARD,
            }
          }, "[REFERRAL_DEBUG] ✅ new user referral rewards CREDITED successfully");

        } else {
          req.log.info({ telegramId, referredBy, reason: "duplicate_row_exists" }, "[REFERRAL_DEBUG] ⚠️ referral skipped — duplicate row");
        }
      } else {
        // Referrer not found — give welcome bonus instead
        req.log.info({ telegramId, referredBy, reason: "referrer_not_found_in_db" }, "[REFERRAL_DEBUG] ⚠️ referral skipped — referrer not found");
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

    await db.update(usersTable).set({ username, firstName, lastName: lastName ?? null, lastActive: new Date() }).where(eq(usersTable.telegramId, telegramId));
    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

    // SAFETY NET: If referredBy was provided for an existing user, check whether
    // a referral was ever recorded. If not (e.g. webhook created the user but the
    // DB insert for the referral failed), record it now as a second-pass.
    if (referredBy && referredBy !== telegramId) {
      const [existingRef] = await db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, telegramId));
      if (!existingRef) {
        req.log.info({ telegramId, referredBy }, "[REFERRAL_DEBUG] existing user without referral row — attempting second-pass referral");

        const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, referredBy));
        if (referrer && user.balance <= WELCOME_BONUS) {
          // Only credit if user balance suggests they haven't been rewarded yet
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

          req.log.info({
            telegramId, referredBy,
            referrer_reward: REFERRER_REWARD,
            referee_bonus: REFEREE_REWARD,
          }, "[REFERRAL_DEBUG] ✅ second-pass referral credited for existing user");
        } else {
          req.log.info({
            telegramId, referredBy,
            reason: !referrer ? "referrer_not_found" : "balance_too_high",
            user_balance: user.balance,
          }, "[REFERRAL_DEBUG] second-pass referral skipped");
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
