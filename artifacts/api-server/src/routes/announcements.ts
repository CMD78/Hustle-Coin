import { Router, type IRouter } from "express";
import { db, announcementsTable, adminLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID } from "../lib/hustlecoin";

const router: IRouter = Router();

function isAdmin(id: string): boolean {
  return id === ADMIN_TELEGRAM_ID;
}

router.get("/admin/announcements", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const items = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt)).limit(50);
  res.json(items.map(a => ({
    id: a.id,
    message: a.message,
    type: a.type,
    isPinned: a.isPinned,
    scheduledFor: a.scheduledFor?.toISOString() ?? null,
    sentAt: a.sentAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    adminTelegramId: a.adminTelegramId,
  })));
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const { telegramId, message, type, isPinned, scheduledFor } = req.body;
  if (!isAdmin(String(telegramId ?? ""))) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!message?.trim()) { res.status(400).json({ error: "Message is required" }); return; }

  const announcementType = type ?? "broadcast";
  const scheduled = scheduledFor ? new Date(scheduledFor) : null;
  const sentAt = scheduled ? null : new Date();

  const [announcement] = await db.insert(announcementsTable).values({
    adminTelegramId: String(telegramId),
    message: message.trim(),
    type: announcementType,
    isPinned: !!isPinned,
    scheduledFor: scheduled,
    sentAt,
  }).returning();

  await db.insert(adminLogsTable).values({
    adminTelegramId: String(telegramId),
    action: "announcement",
    details: `${announcementType}: ${message.substring(0, 60)}`,
  });

  res.json({
    id: announcement.id,
    message: announcement.message,
    type: announcement.type,
    isPinned: announcement.isPinned,
    scheduledFor: announcement.scheduledFor?.toISOString() ?? null,
    sentAt: announcement.sentAt?.toISOString() ?? null,
    createdAt: announcement.createdAt.toISOString(),
  });
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  const adminId = String(req.body?.telegramId ?? req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.get("/admin/export/referrals", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { referralsTable } = await import("@workspace/db");
  const rows = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));

  const csv = [
    "Referrer ID,Referee ID,Referrer Earned,Referee Earned,Date",
    ...rows.map(r => `${r.referrerTelegramId},${r.refereeTelegramId},${r.referrerHpEarned},${r.refereeHpEarned},${r.createdAt.toISOString()}`),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="referrals-${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
});

router.get("/admin/export/transactions", async (req, res): Promise<void> => {
  const adminId = String(req.query.telegramId ?? "");
  if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { miningLogsTable, referralsTable, taskCompletionsTable, tasksTable, usersTable } = await import("@workspace/db");

  const mines = await db.select().from(miningLogsTable).orderBy(desc(miningLogsTable.minedAt));
  const refs = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));
  const completions = await db
    .select({ completion: taskCompletionsTable, task: tasksTable })
    .from(taskCompletionsTable)
    .leftJoin(tasksTable, eq(taskCompletionsTable.taskId, tasksTable.id))
    .orderBy(desc(taskCompletionsTable.completedAt));

  const rows = [
    ...mines.map(m => ({ type: "mining", telegramId: m.telegramId, amount: m.hpEarned + (m.bonusHp ?? 0), date: m.minedAt.toISOString(), note: `Streak ${m.streak}` })),
    ...refs.map(r => ({ type: "referral_reward", telegramId: r.referrerTelegramId, amount: r.referrerHpEarned, date: r.createdAt.toISOString(), note: `Referred ${r.refereeTelegramId}` })),
    ...refs.map(r => ({ type: "referee_bonus", telegramId: r.refereeTelegramId, amount: r.refereeHpEarned, date: r.createdAt.toISOString(), note: `Via ${r.referrerTelegramId}` })),
    ...completions.map(c => ({ type: "task", telegramId: c.completion.telegramId, amount: c.task?.reward ?? 0, date: c.completion.completedAt.toISOString(), note: c.task?.title ?? "Task" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const csv = [
    "Type,Telegram ID,Amount HC,Date,Note",
    ...rows.map(r => `${r.type},${r.telegramId},${r.amount},${r.date},"${r.note}"`),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
});

export default router;
