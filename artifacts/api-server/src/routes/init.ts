import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { InitUserBody, InitUserResponse } from "@workspace/api-zod";
import {
  getLevel,
  getBadges,
  getMineCountdown,
  canMine,
  checkAndUnlockAchievements,
  ADMIN_TELEGRAM_ID,
  WELCOME_BONUS,
  processReferral,
  logReferralEvent,
  recordTransaction,
  createNotification,
} from "../lib/hustlecoin";

const router: IRouter = Router();

// ── POST /api/init ────────────────────────────────────────────────────────────
// Primary Mini App entry point. Called every time the user opens the app.
//
// Referral flow (single entry):
//   New user   → create record → processReferral (credited) OR welcome bonus (fallback)
//   Exist user → update profile → second-pass if referral not yet credited
//
// referralStatus values returned to frontend:
//   "credited"                    — referral rewards issued
//   "skipped_duplicate"           — referral row already exists
//   "skipped_referrer_not_found"  — referrer not yet in DB, welcome bonus granted
//   "skipped_<reason>"            — other skip (self, race, etc.)
//   "welcome_bonus_only"          — no referral param, base welcome bonus given
//   "no_referral"                 — existing user, no pending referral
// ─────────────────────────────────────────────────────────────────────────────
router.post("/init", async (req, res): Promise<void> => {
  const parsed = InitUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, username, firstName, lastName, referredBy: referredByFromRequest } = parsed.data;

  // Normalise: only accept non-self referredBy values
  const effectiveReferredBy =
    referredByFromRequest && referredByFromRequest !== telegramId ? referredByFromRequest : null;

  req.log.info(
    { telegramId, referredBy: effectiveReferredBy ?? null, source: effectiveReferredBy ? "referral_link" : "direct" },
    "[INIT] request received"
  );

  // Log that a referral link was opened (before any DB work)
  if (effectiveReferredBy) {
    await logReferralEvent({
      referrerTelegramId: effectiveReferredBy,
      refereeTelegramId: telegramId,
      step: "link_opened",
      result: "success",
      message: `startapp=${effectiveReferredBy} received in /api/init`,
      source: "init",
    });
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  let referralStatus = "no_referral";

  if (!user) {
    // ── NEW USER ─────────────────────────────────────────────────────────────
    const isAdmin = telegramId === ADMIN_TELEGRAM_ID;

    [user] = await db
      .insert(usersTable)
      .values({
        telegramId,
        username: username || "user",
        firstName,
        lastName: lastName ?? null,
        isAdmin,
        balance: 0,
        referredBy: effectiveReferredBy,
      })
      .returning();

    if (effectiveReferredBy) {
      // Log that referredBy was stored for this user
      await logReferralEvent({
        referrerTelegramId: effectiveReferredBy,
        refereeTelegramId: telegramId,
        step: "referrer_stored",
        result: "success",
        message: `referredBy=${effectiveReferredBy} stored for new user`,
        source: "init",
      });

      const result = await processReferral(telegramId, effectiveReferredBy, "init");

      if (result.credited) {
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = "credited";
        req.log.info({ telegramId, referredBy: effectiveReferredBy }, "[INIT] ✅ new user referral credited");
      } else if (result.reason === "referrer_not_found") {
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = "skipped_referrer_not_found";
        await recordTransaction({ telegramId, type: "welcome_bonus", amount: WELCOME_BONUS, balanceBefore: 0, balanceAfter: WELCOME_BONUS, description: "Welcome bonus" });
        await createNotification({ telegramId, title: "Welcome to HustleCoin! 🎉", message: `You received +${WELCOME_BONUS} HC as a welcome bonus!`, type: "wallet_credit" });
        req.log.info({ telegramId, referredBy: effectiveReferredBy }, "[INIT] referrer not found — welcome bonus granted");
      } else {
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = `skipped_${result.reason ?? "unknown"}`;
        await recordTransaction({ telegramId, type: "welcome_bonus", amount: WELCOME_BONUS, balanceBefore: 0, balanceAfter: WELCOME_BONUS, description: "Welcome bonus" });
        await createNotification({ telegramId, title: "Welcome to HustleCoin! 🎉", message: `You received +${WELCOME_BONUS} HC as a welcome bonus!`, type: "wallet_credit" });
        req.log.info({ telegramId, referredBy: effectiveReferredBy, reason: result.reason }, "[INIT] referral skipped — welcome bonus granted");
      }

    } else {
      // No referral — grant welcome bonus
      referralStatus = "welcome_bonus_only";
      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
      await recordTransaction({ telegramId, type: "welcome_bonus", amount: WELCOME_BONUS, balanceBefore: 0, balanceAfter: WELCOME_BONUS, description: "Welcome bonus" });
      await createNotification({ telegramId, title: "Welcome to HustleCoin! 🎉", message: `You received +${WELCOME_BONUS} HC as a welcome bonus!`, type: "wallet_credit" });
      req.log.info({ telegramId }, "[INIT] new user, no referral — welcome bonus granted");
    }

  } else {
    // ── EXISTING USER ────────────────────────────────────────────────────────
    if (user.isBanned) {
      res.status(403).json({ error: "Account is banned" });
      return;
    }

    await db
      .update(usersTable)
      .set({ username: username || user.username, firstName, lastName: lastName ?? null, lastActive: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

    // ── SECOND-PASS REFERRAL SAFETY NET ──────────────────────────────────────
    // Fires when an existing user has a referredBy that was never credited.
    // Cases where this matters:
    //   a) Webhook created the user with referredBy, but processReferral failed
    //      (referrer wasn't in DB yet) — DB column preserves the ID for later.
    //   b) User was created without a referral, then later opened the app via a
    //      referral link (startapp= present → frontend sends referredBy here).
    //
    // Priority: request referredBy > DB-stored referredBy (request is more recent).
    const resolvedReferredBy =
      effectiveReferredBy ??
      (user.referredBy && user.referredBy !== telegramId ? user.referredBy : null);

    if (resolvedReferredBy) {
      const [existingRef] = await db
        .select()
        .from(referralsTable)
        .where(eq(referralsTable.refereeTelegramId, telegramId));

      if (!existingRef) {
        // Store referredBy on the user row if it came from the request and wasn't stored yet
        if (effectiveReferredBy && !user.referredBy) {
          await db.update(usersTable)
            .set({ referredBy: effectiveReferredBy })
            .where(eq(usersTable.telegramId, telegramId));
          await logReferralEvent({
            referrerTelegramId: effectiveReferredBy,
            refereeTelegramId: telegramId,
            step: "referrer_stored",
            result: "success",
            message: `referredBy=${effectiveReferredBy} stored for existing user (second-pass)`,
            source: "init_second_pass",
          });
        }

        req.log.info(
          { telegramId, resolvedReferredBy },
          "[INIT] existing user has no referral row — second-pass processReferral"
        );

        const result = await processReferral(telegramId, resolvedReferredBy, "init_second_pass");

        if (result.credited) {
          [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          referralStatus = "credited";
          req.log.info({ telegramId, resolvedReferredBy }, "[INIT] ✅ second-pass referral credited");
        } else {
          referralStatus = `skipped_${result.reason ?? "unknown"}`;
          req.log.info({ telegramId, resolvedReferredBy, reason: result.reason }, "[INIT] second-pass referral skipped");
        }
      } else {
        referralStatus = "skipped_duplicate";
      }
    }
  }

  const referralCount = (
    await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))
  ).length;
  const badges = getBadges({ referralCount, streak: user.streak, balance: user.balance, totalMines: user.totalMines });

  await checkAndUnlockAchievements(telegramId, user.balance, user.streak, user.totalMines, referralCount, null);

  const mineCountdown = getMineCountdown(user.lastMine);

  req.log.info(
    { telegramId, final_balance: user.balance, referralStatus, referralCount },
    "[INIT] complete"
  );

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
      referralStatus,
    })
  );
});

export default router;
