import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitUserBody, InitUserResponse } from "@workspace/api-zod";
import { getLevel, getBadges, getMineCountdown, canMine, checkAndUnlockAchievements, updateQuestProgress, ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS } from "../lib/hustlecoin";

const router: IRouter = Router();

router.post("/init", async (req, res): Promise<void> => {
  // ── DEBUG: log raw body before any validation ────────────────────────────
  req.log.info({
    debug_init_raw_body: {
      keys: Object.keys(req.body ?? {}),
      telegramId: req.body?.telegramId,
      username: req.body?.username,
      firstName: req.body?.firstName,
      referredBy_raw: req.body?.referredBy,
      referredBy_type: typeof req.body?.referredBy,
      initData_present: !!req.body?.initData,
    }
  }, "[REFERRAL_DEBUG] raw request body received");
  // ────────────────────────────────────────────────────────────────────────

  const parsed = InitUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, username, firstName, lastName, referredBy } = parsed.data;

  // ── DEBUG: log parsed values after Zod validation ───────────────────────
  req.log.info({
    debug_init_parsed: {
      telegramId,
      username,
      firstName,
      referredBy_parsed: referredBy ?? null,
      referredBy_type: typeof referredBy,
      referredBy_truthy: !!referredBy,
      is_self_referral: referredBy === telegramId,
    }
  }, "[REFERRAL_DEBUG] parsed init body");
  // ────────────────────────────────────────────────────────────────────────

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

  // ── DEBUG: log whether user is new or existing ──────────────────────────
  req.log.info({
    debug_init_user_lookup: {
      telegramId,
      user_exists: !!user,
      existing_balance: user?.balance ?? null,
      existing_referred_by: user?.referredBy ?? null,
    }
  }, "[REFERRAL_DEBUG] user lookup result");
  // ────────────────────────────────────────────────────────────────────────

  if (!user) {
    const isAdmin = telegramId === ADMIN_TELEGRAM_ID;
    [user] = await db
      .insert(usersTable)
      .values({ telegramId, username, firstName, lastName: lastName ?? null, isAdmin, balance: 0 })
      .returning();

    if (referredBy && referredBy !== telegramId) {
      // ── DEBUG: referral branch entered ────────────────────────────────
      req.log.info({
        debug_referral_branch: {
          telegramId,
          referredBy,
          branch: "REFERRAL",
        }
      }, "[REFERRAL_DEBUG] entered REFERRAL branch — looking up referrer");
      // ──────────────────────────────────────────────────────────────────

      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, referredBy));

      // ── DEBUG: referrer lookup result ─────────────────────────────────
      req.log.info({
        debug_referrer_lookup: {
          referredBy,
          referrer_found: !!referrer,
          referrer_balance: referrer?.balance ?? null,
          referrer_username: referrer?.username ?? null,
        }
      }, "[REFERRAL_DEBUG] referrer lookup result");
      // ──────────────────────────────────────────────────────────────────

      if (referrer) {
        const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, telegramId));

        // ── DEBUG: duplicate referral check ────────────────────────────
        req.log.info({
          debug_duplicate_check: {
            telegramId,
            referredBy,
            duplicate_row_exists: !!existing,
          }
        }, "[REFERRAL_DEBUG] duplicate referral row check");
        // ──────────────────────────────────────────────────────────────

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

          // ── DEBUG: referral rewards credited ───────────────────────
          req.log.info({
            debug_referral_credited: {
              referredBy,
              telegramId,
              referrer_reward: REFERRER_REWARD,
              referee_reward: REFEREE_REWARD,
              referrer_new_balance: referrer.balance + REFERRER_REWARD,
              referee_new_balance: user.balance,
            }
          }, "[REFERRAL_DEBUG] ✅ referral rewards CREDITED successfully");
          // ────────────────────────────────────────────────────────────

        } else {
          req.log.info({
            debug_referral_skipped: { telegramId, referredBy, reason: "duplicate_row_exists" }
          }, "[REFERRAL_DEBUG] ⚠️ referral skipped — duplicate row already exists");
        }
      } else {
        req.log.info({
          debug_referral_skipped: { telegramId, referredBy, reason: "referrer_not_found_in_db" }
        }, "[REFERRAL_DEBUG] ⚠️ referral skipped — referrer not found in DB");
      }
    } else {
      // ── DEBUG: welcome bonus branch ────────────────────────────────────
      req.log.info({
        debug_welcome_branch: {
          telegramId,
          referredBy_value: referredBy ?? null,
          referredBy_type: typeof referredBy,
          reason: !referredBy ? "referredBy_falsy" : "self_referral",
          branch: "WELCOME_BONUS",
          bonus: WELCOME_BONUS,
        }
      }, "[REFERRAL_DEBUG] entered WELCOME_BONUS branch — no valid referral code");
      // ──────────────────────────────────────────────────────────────────

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
