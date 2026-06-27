import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, taskCompletionsTable, tasksTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, sql, ilike, or } from "drizzle-orm";
import { getLevel } from "../lib/hustlecoin";

const router: IRouter = Router();

// ── GET /api/wallet ───────────────────────────────────────────────────────────
// Returns balance, per-type earnings breakdown, and full transaction list.
// Sources: mining_logs, task_completions, referrals (for historical records)
// + transactions table (for newer records going forward).
router.get("/wallet", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const transactions: {
    id: string;
    type: "mine" | "task" | "referral" | "admin" | "bonus" | "achievement" | "quest";
    amount: number;
    description: string;
    date: string;
    balanceBefore?: number;
    balanceAfter?: number;
  }[] = [];

  // Mining logs
  const mineLogs = await db.select().from(miningLogsTable)
    .where(eq(miningLogsTable.telegramId, telegramId))
    .orderBy(desc(miningLogsTable.minedAt))
    .limit(100);

  for (const log of mineLogs) {
    const total = log.hpEarned + (log.bonusHp ?? 0);
    let desc2 = `Daily mining reward`;
    if ((log.bonusHp ?? 0) > 0) desc2 += ` (+${log.bonusHp} streak bonus, day ${log.streak})`;
    transactions.push({ id: `mine-${log.id}`, type: "mine", amount: total, description: desc2, date: log.minedAt.toISOString() });
  }

  // Approved task completions
  const completions = await db.select({
    id: taskCompletionsTable.id,
    taskId: taskCompletionsTable.taskId,
    approved: taskCompletionsTable.approved,
    completedAt: taskCompletionsTable.completedAt,
    title: tasksTable.title,
    reward: tasksTable.reward,
  })
    .from(taskCompletionsTable)
    .leftJoin(tasksTable, eq(taskCompletionsTable.taskId, tasksTable.id))
    .where(and(eq(taskCompletionsTable.telegramId, telegramId), eq(taskCompletionsTable.approved, 1)));

  for (const c of completions) {
    transactions.push({
      id: `task-${c.id}`,
      type: "task",
      amount: c.reward ?? 0,
      description: `Task completed: ${c.title ?? "Unknown task"}`,
      date: c.completedAt.toISOString(),
    });
  }

  // Referral rewards (as referrer)
  const refs = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerTelegramId, telegramId));

  for (const r of refs) {
    transactions.push({
      id: `ref-${r.id}`,
      type: "referral",
      amount: r.referrerHpEarned,
      description: `Referral reward — invited a user`,
      date: r.createdAt.toISOString(),
    });
  }

  // Referral bonus (as referee)
  const refereRow = await db.select().from(referralsTable)
    .where(eq(referralsTable.refereeTelegramId, telegramId));
  for (const r of refereRow) {
    transactions.push({
      id: `referee-${r.id}`,
      type: "bonus",
      amount: r.refereeHpEarned,
      description: `Welcome bonus (joined via referral)`,
      date: r.createdAt.toISOString(),
    });
  }

  // Transactions table (admin grants, quest rewards, achievement rewards, etc.)
  // Include types NOT already covered by source tables above
  const txRows = await db.select().from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.telegramId, telegramId),
        // Exclude types already covered by source tables to avoid duplicates
        sql`${transactionsTable.type} NOT IN ('mining', 'referral_reward', 'referral_bonus')`
      )
    )
    .orderBy(desc(transactionsTable.createdAt))
    .limit(100);

  for (const tx of txRows) {
    let type: "admin" | "bonus" | "achievement" | "quest" = "admin";
    if (tx.type === "welcome_bonus") type = "bonus";
    else if (tx.type === "achievement_reward") type = "achievement";
    else if (tx.type === "quest_reward") type = "quest";
    else if (tx.type === "admin_grant" || tx.type === "admin_deduction") type = "admin";
    else if (tx.type === "referral_bonus") type = "bonus";

    transactions.push({
      id: `tx-${tx.id}`,
      type,
      amount: tx.amount,
      description: tx.description,
      date: tx.createdAt.toISOString(),
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
    });
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Compute per-type stats
  const miningEarnings = transactions.filter(t => t.type === "mine").reduce((s, t) => s + t.amount, 0);
  const referralEarnings = transactions.filter(t => t.type === "referral").reduce((s, t) => s + t.amount, 0);
  const taskEarnings = transactions.filter(t => t.type === "task").reduce((s, t) => s + t.amount, 0);
  const bonusEarnings = transactions.filter(t => t.type === "bonus").reduce((s, t) => s + t.amount, 0);
  const achievementEarnings = transactions.filter(t => t.type === "achievement").reduce((s, t) => s + t.amount, 0);
  const questEarnings = transactions.filter(t => t.type === "quest").reduce((s, t) => s + t.amount, 0);
  const adminEarnings = transactions.filter(t => t.type === "admin" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const adminDeductions = transactions.filter(t => t.type === "admin" && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalEarned = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSpent = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  res.json({
    balance: user.balance,
    level: getLevel(user.balance),
    totalEarned,
    totalSpent,
    miningEarnings,
    referralEarnings,
    taskEarnings,
    bonusEarnings,
    achievementEarnings,
    questEarnings,
    adminEarnings,
    adminDeductions,
    transactions: transactions.slice(0, 150),
  });
});

// ── GET /api/wallet/history ───────────────────────────────────────────────────
// Paginated + filtered transaction history from the transactions table.
router.get("/wallet/history", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  const typeFilter = String(req.query.type ?? "");
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);
  const offset = parseInt(String(req.query.offset ?? "0"));
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  let whereClause = eq(transactionsTable.telegramId, telegramId) as any;
  if (typeFilter) {
    whereClause = and(whereClause, eq(transactionsTable.type, typeFilter));
  }
  if (search) {
    whereClause = and(whereClause, ilike(transactionsTable.description, `%${search}%`));
  }

  const rows = await db.select().from(transactionsTable)
    .where(whereClause)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactionsTable)
    .where(whereClause);

  const total = Number(countResult[0]?.count ?? 0);

  res.json({
    transactions: rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      description: tx.description,
      relatedId: tx.relatedId ?? null,
      createdAt: tx.createdAt.toISOString(),
    })),
    total,
    hasMore: offset + limit < total,
  });
});

export default router;
