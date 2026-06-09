import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, taskCompletionsTable, tasksTable, referralsTable, adminLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { getLevel } from "../lib/hustlecoin";

const router: IRouter = Router();

router.get("/wallet", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const transactions: {
    id: string;
    type: "mine" | "task" | "referral" | "admin" | "bonus";
    amount: number;
    description: string;
    date: string;
  }[] = [];

  const mineLogs = await db.select().from(miningLogsTable)
    .where(eq(miningLogsTable.telegramId, telegramId))
    .orderBy(desc(miningLogsTable.minedAt))
    .limit(50);

  for (const log of mineLogs) {
    const total = log.hpEarned + (log.bonusHp ?? 0);
    let desc2 = `Daily mining reward`;
    if ((log.bonusHp ?? 0) > 0) desc2 += ` (+${log.bonusHp} streak bonus, day ${log.streak})`;
    transactions.push({ id: `mine-${log.id}`, type: "mine", amount: total, description: desc2, date: log.minedAt.toISOString() });
  }

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

  const refs = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerTelegramId, telegramId));

  for (const r of refs) {
    transactions.push({
      id: `ref-${r.id}`,
      type: "referral",
      amount: r.referrerHpEarned,
      description: `Referral bonus earned`,
      date: r.createdAt.toISOString(),
    });
  }

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

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalEarned = transactions.reduce((s, t) => s + t.amount, 0);

  res.json({
    balance: user.balance,
    level: getLevel(user.balance),
    totalEarned,
    transactions: transactions.slice(0, 100),
  });
});

export default router;
