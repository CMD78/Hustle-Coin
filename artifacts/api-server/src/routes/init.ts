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
  }, "[REFERRAL_DEBUG] /api/init — raw request body received");

  const parsed = InitUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId, username, firstName, lastName, referredBy: referredByFromRequest } = parsed.data;

  req.log.info({
    debug_init_parsed: {
      telegramId,
      referredBy_from_request: referredByFromRequest ?? null,
      referredBy_truthy: !!referredByFromRequest,
      is_self_referral: referredByFromRequest === telegramId,
    }
  }, "[REFERRAL_DEBUG] parsed init body");

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));

  req.log.info({
    debug_init_user_lookup: {
      telegramId,
      user_exists: !!user,
      existing_balance: user?.balance ?? null,
      db_referredBy: user?.referredBy ?? null,
    }
  }, "[REFERRAL_DEBUG] user lookup result");

  // referralStatus is returned to the frontend so it knows whether to clear
  // the pending referral from localStorage.
  // Possible values: "credited" | "skipped_duplicate" | "skipped_referrer_not_found"
  //                | "skipped_self" | "skipped_invalid" | "welcome_bonus_only" | "no_referral"
  let referralStatus = "no_referral";

  if (!user) {
    // ── NEW USER ─────────────────────────────────────────────────────────────
    const isAdmin = telegramId === ADMIN_TELEGRAM_ID;
    const effectiveReferredBy =
      referredByFromRequest && referredByFromRequest !== telegramId ? referredByFromRequest : null;

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
      req.log.info(
        { telegramId, referredBy: effectiveReferredBy, source: "request" },
        "[REFERRAL_DEBUG] new user — attempting processReferral"
      );

      const result = await processReferral(telegramId, effectiveReferredBy);

      if (result.credited) {
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = "credited";
        req.log.info(
          { telegramId, referredBy: effectiveReferredBy },
          "[REFERRAL_DEBUG] ✅ new user referral credited"
        );
      } else if (result.reason === "referrer_not_found") {
        // Referrer not yet in DB — grant welcome bonus; keep referralStatus as-is
        // so frontend preserves localStorage (referrer may join DB later, but
        // realistically the retry window is short — welcome bonus is a fair fallback).
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = "skipped_referrer_not_found";
        req.log.info(
          { telegramId, referredBy: effectiveReferredBy },
          "[REFERRAL_DEBUG] referrer not found — welcome bonus granted"
        );
      } else {
        // Any other skip reason (self-referral, race-condition duplicate, etc.)
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
        referralStatus = `skipped_${result.reason ?? "unknown"}`;
        req.log.info(
          { telegramId, referredBy: effectiveReferredBy, reason: result.reason },
          "[REFERRAL_DEBUG] referral skipped — welcome bonus granted as fallback"
        );
      }

    } else {
      // No referral — grant welcome bonus
      referralStatus = "welcome_bonus_only";
      req.log.info({
        telegramId,
        referredBy_from_request: referredByFromRequest ?? null,
        reason: !referredByFromRequest ? "referredBy_falsy" : "self_referral",
        bonus: WELCOME_BONUS,
      }, "[REFERRAL_DEBUG] new user — no valid referral — granting welcome bonus");

      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, telegramId));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
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

    // SECOND-PASS REFERRAL SAFETY NET
    // This fires when:
    //   a) The webhook created the user and processed the referral, but the referral row
    //      insert failed silently (race/error) — the DB referredBy column preserves the ID.
    //   b) The user was created via webhook or init without a referral, then opens the app
    //      later via a referral link (start_param present → frontend sends referredBy).
    //   c) The user opens via menu button (no start_param), but their DB referredBy column
    //      was written at creation time and no referral row was ever created.
    //
    // Priority: request referredBy > DB-stored referredBy
    const effectiveReferredBy =
      (referredByFromRequest && referredByFromRequest !== telegramId ? referredByFromRequest : null) ??
      (user.referredBy && user.referredBy !== telegramId ? user.referredBy : null);

    req.log.info({
      telegramId,
      referredBy_from_request: referredByFromRequest ?? null,
      referredBy_from_db: user.referredBy ?? null,
      effective_referredBy: effectiveReferredBy,
    }, "[REFERRAL_DEBUG] existing user — resolved effective referredBy for second-pass check");

    if (effectiveReferredBy) {
      const [existingRef] = await db
        .select()
        .from(referralsTable)
        .where(eq(referralsTable.refereeTelegramId, telegramId));

      if (!existingRef) {
        req.log.info(
          { telegramId, referredBy: effectiveReferredBy },
          "[REFERRAL_DEBUG] existing user has no referral row — attempting second-pass processReferral"
        );

        const result = await processReferral(telegramId, effectiveReferredBy);

        if (result.credited) {
          [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
          referralStatus = "credited";
          req.log.info(
            { telegramId, referredBy: effectiveReferredBy },
            "[REFERRAL_DEBUG] ✅ second-pass referral credited"
          );
        } else {
          referralStatus = `skipped_${result.reason ?? "unknown"}`;
          req.log.info(
            { telegramId, referredBy: effectiveReferredBy, reason: result.reason },
            "[REFERRAL_DEBUG] second-pass referral skipped"
          );
        }
      } else {
        referralStatus = "skipped_duplicate";
        req.log.info(
          { telegramId, referredBy: effectiveReferredBy, existing_referrer: existingRef.referrerTelegramId },
          "[REFERRAL_DEBUG] existing user already has referral row — no action needed"
        );
      }
    }
  }

  const referralCount = (
    await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, telegramId))
  ).length;
  const badges = getBadges({ referralCount, streak: user.streak, balance: user.balance, totalMines: user.totalMines });

  await checkAndUnlockAchievements(telegramId, user.balance, user.streak, user.totalMines, referralCount, null);

  const mineCountdown = getMineCountdown(user.lastMine);

  req.log.info({
    telegramId,
    final_balance: user.balance,
    referral_status: referralStatus,
    referral_count: referralCount,
  }, "[REFERRAL_DEBUG] /api/init complete");

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
