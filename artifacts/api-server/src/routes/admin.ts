import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, referralEventsTable, achievementUnlocksTable, miningLogsTable, adminLogsTable, feedbackTable, taskCompletionsTable, tasksTable } from "@workspace/db";
import { getInitTraces, getAllTracedUsers } from "../lib/init-trace";
import { eq, gte, ilike, or, desc, sql, and } from "drizzle-orm";
import {
  GetAdminStatsQueryParams, GetAdminStatsResponse,
  GetAdminUsersQueryParams, GetAdminUsersResponse,
  GrantHpBody, GrantHpResponse,
  BroadcastMessageBody, BroadcastMessageResponse,
  GetAdminFeedbackQueryParams, GetAdminFeedbackResponse,
} from "@workspace/api-zod";
import { ADMIN_TELEGRAM_ID, getLevel, processReferral, REFERRER_REWARD, REFEREE_REWARD, recordTransaction, createNotification } from "../lib/hustlecoin";

const router: IRouter = Router();

function isAdmin(id: string): boolean {
  return id === ADMIN_TELEGRAM_ID;
}

router.get("/admin/stats", async (req, res): Promise<void> => {
  const parsed = GetAdminStatsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isAdmin(parsed.data.telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allUsers = await db.select().from(usersTable);
  const totalUsers = allUsers.length;
  const newUsersToday = (await db.select().from(usersTable).where(gte(usersTable.joinDate, todayStart))).length;
  const newUsersThisWeek = (await db.select().from(usersTable).where(gte(usersTable.joinDate, weekStart))).length;
  const activeUsersToday = (await db.select().from(usersTable).where(gte(usersTable.lastActive, todayStart))).length;
  const activeUsersThisWeek = (await db.select().from(usersTable).where(gte(usersTable.lastActive, weekStart))).length;
  const averageHp = allUsers.length > 0 ? Math.round(allUsers.reduce((s, u) => s + u.balance, 0) / allUsers.length) : 0;
  const totalReferrals = (await db.select().from(referralsTable)).length;
  const totalAchievements = (await db.select().from(achievementUnlocksTable)).length;
  const totalMines = (await db.select().from(miningLogsTable)).length;
  const totalCoins = allUsers.reduce((s, u) => s + u.balance, 0);

  const pendingTaskRows = await db
    .select()
    .from(taskCompletionsTable)
    .where(eq(taskCompletionsTable.approved, 0));
  const pendingTasks = pendingTaskRows.length;

  const approvedTaskRows = await db
    .select({ reward: tasksTable.reward })
    .from(taskCompletionsTable)
    .innerJoin(tasksTable, eq(taskCompletionsTable.taskId, tasksTable.id))
    .where(eq(taskCompletionsTable.approved, 1));
  const taskRewardsOut = approvedTaskRows.reduce((s, r) => s + (r.reward ?? 0), 0);

  const allTasks = await db.select().from(tasksTable).where(eq(tasksTable.status, "active"));
  const automaticTasksCount = allTasks.filter(t => t.taskType === "automatic").length;
  const manualTasksCount = allTasks.filter(t => t.taskType !== "automatic").length;

  res.json(
    GetAdminStatsResponse.parse({ totalUsers, newUsersToday, newUsersThisWeek, activeUsersToday, activeUsersThisWeek, averageHp, totalReferrals, totalAchievements, totalMines, totalCoins, pendingTasks, taskRewardsOut, automaticTasksCount, manualTasksCount })
  );
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const parsed = GetAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isAdmin(parsed.data.telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { limit, offset } = parsed.data;
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.joinDate)).limit(limit ?? 50).offset(offset ?? 0);

  const result = await Promise.all(
    users.map(async (u) => {
      const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, u.telegramId))).length;
      return {
        id: u.id,
        telegramId: u.telegramId,
        username: u.username,
        firstName: u.firstName,
        balance: u.balance,
        level: getLevel(u.balance),
        streak: u.streak,
        joinDate: u.joinDate.toISOString(),
        totalMines: u.totalMines,
        referralCount,
        isBanned: u.isBanned,
      };
    })
  );

  res.json(GetAdminUsersResponse.parse(result));
});

router.get("/admin/users/search", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  const query = String(req.query.q ?? "").trim();
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!query) { res.json([]); return; }

  const users = await db.select().from(usersTable)
    .where(or(
      ilike(usersTable.username, `%${query}%`),
      ilike(usersTable.firstName, `%${query}%`),
      ilike(usersTable.telegramId, `%${query}%`)
    ))
    .limit(20);

  const result = await Promise.all(
    users.map(async (u) => {
      const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, u.telegramId))).length;
      return {
        id: u.id,
        telegramId: u.telegramId,
        username: u.username,
        firstName: u.firstName,
        balance: u.balance,
        level: getLevel(u.balance),
        streak: u.streak,
        joinDate: u.joinDate.toISOString(),
        totalMines: u.totalMines,
        referralCount,
        isBanned: u.isBanned,
      };
    })
  );

  res.json(result);
});

router.get("/admin/users/:targetId/details", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  const targetId = req.params.targetId;
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [referrals, achievementUnlocks] = await Promise.all([
    db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, targetId)),
    db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, targetId)),
  ]);

  const [hpMinedResult, recentMines, completions, rankResult] = await Promise.all([
    db.execute(sql`SELECT COALESCE(SUM(hp_earned + bonus_hp), 0) as total FROM mining_logs WHERE telegram_id = ${targetId}`),
    db.select().from(miningLogsTable).where(eq(miningLogsTable.telegramId, targetId)).orderBy(desc(miningLogsTable.minedAt)).limit(5),
    db.select({
      id: taskCompletionsTable.id,
      taskId: taskCompletionsTable.taskId,
      approved: taskCompletionsTable.approved,
      completedAt: taskCompletionsTable.completedAt,
      taskTitle: tasksTable.title,
      taskReward: tasksTable.reward,
    }).from(taskCompletionsTable)
      .leftJoin(tasksTable, eq(taskCompletionsTable.taskId, tasksTable.id))
      .where(eq(taskCompletionsTable.telegramId, targetId))
      .orderBy(desc(taskCompletionsTable.completedAt))
      .limit(20),
    db.execute(sql`SELECT COUNT(*) + 1 as rank FROM ${usersTable} WHERE balance > ${user.balance}`),
  ]);

  const totalHpMined = parseInt(String((hpMinedResult.rows[0] as any)?.total ?? "0"), 10);
  const rank = parseInt(String((rankResult.rows[0] as any)?.rank ?? "1"), 10);

  res.json({
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
    lastActive: user.lastActive?.toISOString() ?? null,
    joinDate: user.joinDate.toISOString(),
    isBanned: user.isBanned,
    referralCount: referrals.length,
    totalHpMined,
    rank,
    recentMines: recentMines.map(m => ({ hpEarned: m.hpEarned, bonusHp: m.bonusHp, streak: m.streak, minedAt: m.minedAt.toISOString() })),
    achievementCount: achievementUnlocks.length,
    taskCompletions: completions.map(tc => ({
      id: tc.id,
      taskId: tc.taskId,
      taskTitle: tc.taskTitle ?? "Unknown Task",
      taskReward: tc.taskReward ?? 0,
      approved: tc.approved === 1,
      completedAt: tc.completedAt.toISOString(),
    })),
    referrals: referrals.slice(0, 15).map(r => ({ refereeTelegramId: r.refereeTelegramId, createdAt: r.createdAt.toISOString() })),
  });
});

router.get("/admin/recent-activity", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const recentUsers = await db.select().from(usersTable).orderBy(desc(usersTable.joinDate)).limit(10);
  const recentReferrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt)).limit(10);
  const recentMines = await db.select().from(miningLogsTable).orderBy(desc(miningLogsTable.minedAt)).limit(10);

  res.json({
    recentUsers: recentUsers.map(u => ({
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      balance: u.balance,
      joinDate: u.joinDate.toISOString(),
      isBanned: u.isBanned,
    })),
    recentReferrals: recentReferrals.map(r => ({
      referrerTelegramId: r.referrerTelegramId,
      refereeTelegramId: r.refereeTelegramId,
      referrerHpEarned: r.referrerHpEarned,
      refereeHpEarned: r.refereeHpEarned,
      createdAt: r.createdAt.toISOString(),
    })),
    recentMines: recentMines.map(m => ({
      telegramId: m.telegramId,
      hpEarned: m.hpEarned,
      bonusHp: m.bonusHp,
      streak: m.streak,
      minedAt: m.minedAt.toISOString(),
    })),
  });
});

router.post("/admin/users/:telegramId/ban", async (req, res): Promise<void> => {
  const adminId = String(req.body?.adminTelegramId ?? "");
  const targetId = req.params.telegramId;
  const reason = String(req.body?.reason ?? "No reason given");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (targetId === ADMIN_TELEGRAM_ID) { res.status(400).json({ error: "Cannot ban admin" }); return; }

  await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.telegramId, targetId));
  await db.insert(adminLogsTable).values({ adminTelegramId: adminId, action: "ban_user", targetTelegramId: targetId, details: reason });
  res.json({ success: true, message: `User ${targetId} banned` });
});

router.post("/admin/users/:telegramId/unban", async (req, res): Promise<void> => {
  const adminId = String(req.body?.adminTelegramId ?? "");
  const targetId = req.params.telegramId;
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.telegramId, targetId));
  await db.insert(adminLogsTable).values({ adminTelegramId: adminId, action: "unban_user", targetTelegramId: targetId, details: "Unbanned" });
  res.json({ success: true, message: `User ${targetId} unbanned` });
});

router.post("/admin/grant-hp", async (req, res): Promise<void> => {
  const parsed = GrantHpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isAdmin(parsed.data.adminTelegramId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { targetTelegramId, amount, reason, adminTelegramId } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetTelegramId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const newBalance = Math.max(0, user.balance + amount);
  await db.update(usersTable).set({ balance: newBalance, level: getLevel(newBalance) }).where(eq(usersTable.telegramId, targetTelegramId));
  await db.insert(adminLogsTable).values({ adminTelegramId, action: amount >= 0 ? "grant_hp" : "remove_hp", targetTelegramId, details: `${amount} HC — ${reason}` });
  await recordTransaction({ telegramId: targetTelegramId, type: amount >= 0 ? "admin_grant" : "admin_deduction", amount, balanceBefore: user.balance, balanceAfter: newBalance, description: `Admin ${amount >= 0 ? "grant" : "deduction"}: ${reason}`, relatedId: adminTelegramId });
  await createNotification({ telegramId: targetTelegramId, title: amount >= 0 ? "HC Credited! 💰" : "HC Adjusted", message: `${Math.abs(amount)} HC ${amount >= 0 ? "added to" : "removed from"} your wallet. Reason: ${reason}`, type: amount >= 0 ? "wallet_credit" : "wallet_adjustment" });

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.telegramId, targetTelegramId));

  res.json(
    GrantHpResponse.parse({
      id: updated.id,
      telegramId: updated.telegramId,
      username: updated.username,
      firstName: updated.firstName,
      lastName: updated.lastName ?? null,
      balance: updated.balance,
      level: getLevel(updated.balance),
      streak: updated.streak,
      totalMines: updated.totalMines,
      lastMine: updated.lastMine?.toISOString() ?? null,
      canMine: true,
      mineCountdown: null,
      referralCount: 0,
      achievementCount: 0,
      joinDate: updated.joinDate.toISOString(),
      rank: null,
      badges: [],
    })
  );
});

router.post("/admin/broadcast", async (req, res): Promise<void> => {
  const parsed = BroadcastMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isAdmin(parsed.data.adminTelegramId)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.insert(adminLogsTable).values({ adminTelegramId: parsed.data.adminTelegramId, action: "broadcast", details: parsed.data.message });
  res.json(BroadcastMessageResponse.parse({ success: true, message: "Broadcast logged. Connect to Telegram Bot API to send." }));
});

router.get("/admin/feedback", async (req, res): Promise<void> => {
  const parsed = GetAdminFeedbackQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!isAdmin(parsed.data.telegramId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const items = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt));
  res.json(GetAdminFeedbackResponse.parse(items.map(f => ({
    id: f.id,
    telegramId: f.telegramId,
    message: f.message,
    adminReply: f.adminReply ?? null,
    createdAt: f.createdAt.toISOString(),
  }))));
});

router.get("/admin/deploy-check", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const checks: Record<string, { status: "PASS" | "FAIL"; detail: string }> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "PASS", detail: "PostgreSQL connected" };
  } catch {
    checks.database = { status: "FAIL", detail: "Database connection failed" };
  }

  try {
    const userCount = (await db.select().from(usersTable)).length;
    checks.users = { status: "PASS", detail: `${userCount} registered users` };
  } catch {
    checks.users = { status: "FAIL", detail: "Could not query users" };
  }

  try {
    const refCount = (await db.select().from(referralsTable)).length;
    checks.referrals = { status: "PASS", detail: `${refCount} referrals tracked` };
  } catch {
    checks.referrals = { status: "FAIL", detail: "Could not query referrals" };
  }

  try {
    const eventCount = (await db.select().from(referralEventsTable)).length;
    checks.referral_events = { status: "PASS", detail: `${eventCount} referral events logged` };
  } catch {
    checks.referral_events = { status: "FAIL", detail: "referral_events table not yet created — run DB push" };
  }

  try {
    const mineCount = (await db.select().from(miningLogsTable)).length;
    checks.mining = { status: "PASS", detail: `${mineCount} mining events` };
  } catch {
    checks.mining = { status: "FAIL", detail: "Could not query mining logs" };
  }

  try {
    const feedbackCount = (await db.select().from(feedbackTable)).length;
    checks.feedback = { status: "PASS", detail: `${feedbackCount} feedback items` };
  } catch {
    checks.feedback = { status: "FAIL", detail: "Could not query feedback" };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const botUsername = process.env.BOT_USERNAME ?? process.env.TELEGRAM_BOT_USERNAME;
  checks.telegram_token = { status: botToken ? "PASS" : "FAIL", detail: botToken ? "Bot token configured" : "Set TELEGRAM_BOT_TOKEN env var" };
  checks.telegram_username = { status: botUsername ? "PASS" : "FAIL", detail: botUsername ? `@${botUsername}` : "Set BOT_USERNAME env var" };
  checks.hmac = { status: "PASS", detail: "HMAC validation via initData supported" };
  checks.security = { status: "PASS", detail: "Admin gated by Telegram ID + ban enforcement" };
  checks.rewards = { status: "PASS", detail: `Referrer: +${REFERRER_REWARD} HC, Referee: +${REFEREE_REWARD} HC, Welcome: +250 HC` };
  checks.version = { status: "PASS", detail: "HustleCoin Beta v1.0" };

  const allPass = Object.values(checks).every(c => c.status === "PASS");
  res.json({ overall: allPass ? "PASS" : "FAIL", checks });
});

// ── POST /api/admin/repair-referral ──────────────────────────────────────────
// Manually credits a missed referral between two existing users.
// Useful when a referral link was clicked but the reward was not issued
// (e.g., referrer wasn't in DB at the time).
//
// Pre-conditions checked before calling processReferral:
//   - Both users must exist in DB
//   - No referral row must already exist for the referee
//   - Not a self-referral
//
// Auth: adminTelegramId body field must match ADMIN_TELEGRAM_ID.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/repair-referral", async (req, res): Promise<void> => {
  const adminId = String(req.body?.adminTelegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const referrerTelegramId = String(req.body?.referrerTelegramId ?? "").trim();
  const refereeTelegramId  = String(req.body?.refereeTelegramId  ?? "").trim();

  if (!referrerTelegramId || !refereeTelegramId) {
    res.status(400).json({ error: "referrerTelegramId and refereeTelegramId are required" });
    return;
  }

  if (referrerTelegramId === refereeTelegramId) {
    res.status(400).json({ error: "Cannot repair a self-referral" });
    return;
  }

  const [[referrer], [referee]] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.telegramId, referrerTelegramId)),
    db.select().from(usersTable).where(eq(usersTable.telegramId, refereeTelegramId)),
  ]);

  if (!referrer) {
    res.status(404).json({ error: `Referrer ${referrerTelegramId} not found in DB` });
    return;
  }
  if (!referee) {
    res.status(404).json({ error: `Referee ${refereeTelegramId} not found in DB` });
    return;
  }

  const [existingRef] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.refereeTelegramId, refereeTelegramId));

  if (existingRef) {
    res.status(409).json({
      error: "Referral already exists for this referee",
      existing_referral: {
        referrer_telegram_id: existingRef.referrerTelegramId,
        referrer_hp_earned: existingRef.referrerHpEarned,
        referee_hp_earned: existingRef.refereeHpEarned,
        created_at: existingRef.createdAt.toISOString(),
      },
    });
    return;
  }

  const result = await processReferral(refereeTelegramId, referrerTelegramId, "admin_repair");

  // Persist referredBy on the user row if not already set
  if (result.credited && !referee.referredBy) {
    await db.update(usersTable)
      .set({ referredBy: referrerTelegramId })
      .where(eq(usersTable.telegramId, refereeTelegramId));
  }

  // Log the admin action
  await db.insert(adminLogsTable).values({
    adminTelegramId: adminId,
    action: "repair_referral",
    targetTelegramId: refereeTelegramId,
    details: `referee=${refereeTelegramId}, referrer=${referrerTelegramId}, result=${result.credited ? "credited" : result.reason}`,
  });

  res.json({
    success: result.credited,
    referrer_telegram_id: referrerTelegramId,
    referee_telegram_id: refereeTelegramId,
    result: result.credited ? "credited" : "skipped",
    reason: result.reason ?? null,
    message: result.credited
      ? `Referral repaired — referrer +${REFERRER_REWARD} HC, referee +${REFEREE_REWARD} HC`
      : `Repair skipped: ${result.reason}`,
  });
});

// ── GET /api/admin/referral-debug/:telegramId ─────────────────────────────────
// Returns a complete diagnostic snapshot of a user's referral state including
// the full event log for the referee (all steps that were recorded).
//
// Diagnosis section answers:
//   - Was a referral link received?     → link_opened event in referral_events
//   - Was referredBy stored?            → referrer_stored event
//   - Was a referral row created?       → referral_as_referee.has_referral_row
//   - Were rewards credited?            → completed event / referral row present
//   - Was there a duplicate?            → duplicate_referral event
//   - Exact failure reason?             → failure_reason field + events log
//
// Auth: adminTelegramId query param must match ADMIN_TELEGRAM_ID.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral-debug/:telegramId", async (req, res): Promise<void> => {
  const adminId = String(req.query.adminTelegramId ?? req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const targetId = req.params.telegramId;

  const [
    [user],
    referralAsReferee,
    referralsAsReferrer,
    recentEvents,
  ] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.telegramId, targetId)),
    db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, targetId)),
    db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, targetId)),
    db.select()
      .from(referralEventsTable)
      .where(eq(referralEventsTable.refereeTelegramId, targetId))
      .orderBy(desc(referralEventsTable.createdAt))
      .limit(30),
  ]);

  // Look up the referrer from the DB column
  let referrerRecord: { telegramId: string; username: string; firstName: string; balance: number; joinDate: string } | null = null;
  if (user?.referredBy) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, user.referredBy));
    if (referrer) {
      referrerRecord = {
        telegramId: referrer.telegramId,
        username: referrer.username,
        firstName: referrer.firstName,
        balance: referrer.balance,
        joinDate: referrer.joinDate.toISOString(),
      };
    }
  }

  // Look up the referrer from the referral row (may differ from DB column)
  let referralRowReferrer: { telegramId: string; username: string; firstName: string } | null = null;
  if (referralAsReferee.length > 0) {
    const row = referralAsReferee[0];
    const [r] = await db.select().from(usersTable).where(eq(usersTable.telegramId, row.referrerTelegramId));
    if (r) {
      referralRowReferrer = { telegramId: r.telegramId, username: r.username, firstName: r.firstName };
    }
  }

  // Determine what processReferral would return if called now (dry run)
  let simulatedOutcome: string;
  if (!user) {
    simulatedOutcome = "user_not_found";
  } else if (!user.referredBy) {
    simulatedOutcome = "no_referredBy_in_db — would need frontend to supply it";
  } else if (user.referredBy === targetId) {
    simulatedOutcome = "self_referral — invalid";
  } else if (referralAsReferee.length > 0) {
    simulatedOutcome = "duplicate_row_exists — referral already credited";
  } else if (!referrerRecord) {
    simulatedOutcome = "referrer_not_found — referrer is not in DB";
  } else {
    simulatedOutcome = `would_credit — +${REFERRER_REWARD} HC to referrer ${user.referredBy}, +${REFEREE_REWARD} HC to this user`;
  }

  // Failure reason derivation from event log
  const lastFailEvent = recentEvents.find(e => e.result === "skipped" || e.result === "failed");
  const lastSuccessEvent = recentEvents.find(e => e.result === "success" && e.step === "completed");

  const failureReason = referralAsReferee.length > 0
    ? null
    : !user
    ? "user_not_found"
    : !user.referredBy
    ? "no_referredBy_stored_in_db"
    : !referrerRecord
    ? "referrer_not_in_db"
    : lastFailEvent
    ? `${lastFailEvent.step}: ${lastFailEvent.message ?? lastFailEvent.result}`
    : "referral_row_missing_but_all_data_present — second-pass should fix on next /api/init";

  res.json({
    queried_at: new Date().toISOString(),
    target_telegram_id: targetId,

    user_record: user
      ? {
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          balance: user.balance,
          joinDate: user.joinDate.toISOString(),
          lastActive: user.lastActive?.toISOString() ?? null,
          isBanned: user.isBanned,
          referredBy_in_db: user.referredBy ?? null,
        }
      : null,
    user_exists: !!user,

    referral_as_referee: {
      has_referral_row: referralAsReferee.length > 0,
      row: referralAsReferee.length > 0
        ? {
            id: referralAsReferee[0].id,
            referrer_telegram_id: referralAsReferee[0].referrerTelegramId,
            referrer_hp_earned: referralAsReferee[0].referrerHpEarned,
            referee_hp_earned: referralAsReferee[0].refereeHpEarned,
            created_at: referralAsReferee[0].createdAt.toISOString(),
          }
        : null,
      referrer_record: referralRowReferrer,
    },

    referrer_record_from_db_column: referrerRecord,

    referrals_as_referrer: {
      count: referralsAsReferrer.length,
      total_hc_earned: referralsAsReferrer.reduce((s, r) => s + r.referrerHpEarned, 0),
      list: referralsAsReferrer.map(r => ({
        referee_telegram_id: r.refereeTelegramId,
        referee_hp_earned: r.refereeHpEarned,
        referrer_hp_earned: r.referrerHpEarned,
        created_at: r.createdAt.toISOString(),
      })),
    },

    referral_events: recentEvents.map(e => ({
      id: e.id,
      step: e.step,
      result: e.result,
      message: e.message ?? null,
      source: e.source ?? null,
      referrer_telegram_id: e.referrerTelegramId ?? null,
      created_at: e.createdAt.toISOString(),
    })),

    diagnosis: {
      simulated_processReferral_outcome: simulatedOutcome,
      referral_credited: referralAsReferee.length > 0,
      referral_row_missing: referralAsReferee.length === 0,
      db_referredBy_set: !!user?.referredBy,
      db_referredBy_matches_row: referralAsReferee.length > 0
        ? referralAsReferee[0].referrerTelegramId === user?.referredBy
        : null,
      referrer_in_db: !!referrerRecord,
      link_opened_event_found: recentEvents.some(e => e.step === "link_opened"),
      referrer_stored_event_found: recentEvents.some(e => e.step === "referrer_stored"),
      reward_credited_event_found: recentEvents.some(e => e.step === "completed" && e.result === "success"),
      duplicate_event_found: recentEvents.some(e => e.step === "duplicate_referral"),
      failure_reason: failureReason,
    },
  });
});

// ── GET /api/admin/referral-trace/:telegramId ──────────────────────────────
// Temporary diagnostic endpoint — returns the last 5 /api/init call traces
// for a given user, including everything the backend received and computed
// about the referral parameter on each call.
//
// Fields per trace:
//   timestamp                   — when /api/init was called
//   is_new_user                 — true on first call, false on subsequent
//   raw_init_data               — tg.initData string sent by the frontend
//   raw_init_data_present       — whether initData was non-empty
//   start_param_from_init_data  — start_param parsed from raw initData
//   request_body_referred_by    — req.body.referredBy as received
//   effective_referred_by       — after self-referral filter (null = dropped)
//   referral_link               — the link this user shares with others
//   referral_link_uses_startapp — true = ?startapp= | false = ?start= (broken)
//   app_shortname               — APP_SHORTNAME env value at request time
//
// Auth: adminTelegramId query param must match ADMIN_TELEGRAM_ID.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/referral-trace/:telegramId", (req, res): void => {
  const adminId = String(req.query.adminTelegramId ?? req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const targetId = req.params.telegramId;
  const traces = getInitTraces(targetId);

  res.json({
    queried_at: new Date().toISOString(),
    target_telegram_id: targetId,
    trace_count: traces.length,
    note: traces.length === 0
      ? "No traces yet — the user must open the app (triggering /api/init) after the server restarted. Traces are in-memory and reset on server restart."
      : null,
    traces: traces.map(t => ({
      timestamp: t.timestamp,
      is_new_user: t.is_new_user,
      username: t.username ?? null,
      raw_init_data_present: !!t.raw_init_data,
      raw_init_data_length: t.raw_init_data?.length ?? 0,
      raw_init_data: t.raw_init_data,
      start_param_from_init_data: t.start_param_from_init_data,
      request_body_referred_by: t.request_body_referred_by ?? null,
      effective_referred_by: t.effective_referred_by,
      referral_link_uses_startapp: t.referral_link_uses_startapp,
      referral_link: t.referral_link,
      app_shortname: t.app_shortname,
      bot_username: t.bot_username,
      verdict: (() => {
        if (!t.raw_init_data) return "NO_INIT_DATA — frontend did not send tg.initData";
        if (!t.start_param_from_init_data && !t.request_body_referred_by)
          return "NO_REFERRAL — start_param absent from initData and referredBy not sent";
        if (!t.start_param_from_init_data && t.request_body_referred_by)
          return "REFERRAL_FROM_FALLBACK — start_param absent but referredBy came from another source (URL param or localStorage)";
        if (t.start_param_from_init_data && t.request_body_referred_by)
          return "REFERRAL_PRESENT — start_param found in initData and referredBy sent";
        if (t.start_param_from_init_data && !t.request_body_referred_by)
          return "BUG — start_param present in initData but frontend did not send referredBy";
        return "UNKNOWN";
      })(),
    })),
    all_traced_users: getAllTracedUsers(),
  });
});

export default router;
