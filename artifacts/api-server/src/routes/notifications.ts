import { Router, type IRouter } from "express";
import { db, notificationsTable, notificationSettingsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID, createNotification } from "../lib/hustlecoin";

const router: IRouter = Router();

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get("/notifications", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  const limit = Math.min(parseInt(String(req.query.limit ?? "30")), 100);
  const offset = parseInt(String(req.query.offset ?? "0"));
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.telegramId, telegramId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notificationsTable)
    .where(eq(notificationsTable.telegramId, telegramId));

  const unread = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.telegramId, telegramId), eq(notificationsTable.read, false)));

  res.json({
    notifications: rows.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      relatedEntity: n.relatedEntity ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    total: Number(total[0]?.count ?? 0),
    unread: Number(unread[0]?.count ?? 0),
    hasMore: offset + limit < Number(total[0]?.count ?? 0),
  });
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.telegramId, telegramId), eq(notificationsTable.read, false)));

  res.json({ unread: Number(result[0]?.count ?? 0) });
});

// ── POST /api/notifications/:id/read ─────────────────────────────────────────
router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const telegramId = String(req.body?.telegramId ?? "");
  const id = parseInt(req.params.id);
  if (!telegramId || isNaN(id)) { res.status(400).json({ error: "telegramId and valid id required" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.telegramId, telegramId)));

  res.json({ ok: true });
});

// ── POST /api/notifications/read-all ─────────────────────────────────────────
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const telegramId = String(req.body?.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.telegramId, telegramId), eq(notificationsTable.read, false)));

  res.json({ ok: true });
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  const id = parseInt(req.params.id);
  if (!telegramId || isNaN(id)) { res.status(400).json({ error: "telegramId and valid id required" }); return; }

  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.telegramId, telegramId)));

  res.json({ ok: true });
});

// ── GET /api/notifications/settings ──────────────────────────────────────────
router.get("/notifications/settings", async (req, res): Promise<void> => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.telegramId, telegramId));

  if (!settings) {
    res.json({
      miningReminder: true,
      taskReminder: true,
      referralRewards: true,
      challengeAlerts: true,
      achievementAlerts: true,
      announcements: true,
      weeklySummary: false,
    });
    return;
  }

  res.json({
    miningReminder: settings.miningReminder,
    taskReminder: settings.taskReminder,
    referralRewards: settings.referralRewards,
    challengeAlerts: settings.challengeAlerts,
    achievementAlerts: settings.achievementAlerts,
    announcements: settings.announcements,
    weeklySummary: settings.weeklySummary,
  });
});

// ── PUT /api/notifications/settings ──────────────────────────────────────────
router.put("/notifications/settings", async (req, res): Promise<void> => {
  const telegramId = String(req.body?.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const {
    miningReminder, taskReminder, referralRewards,
    challengeAlerts, achievementAlerts, announcements, weeklySummary
  } = req.body;

  const values = {
    telegramId,
    ...(miningReminder !== undefined && { miningReminder: Boolean(miningReminder) }),
    ...(taskReminder !== undefined && { taskReminder: Boolean(taskReminder) }),
    ...(referralRewards !== undefined && { referralRewards: Boolean(referralRewards) }),
    ...(challengeAlerts !== undefined && { challengeAlerts: Boolean(challengeAlerts) }),
    ...(achievementAlerts !== undefined && { achievementAlerts: Boolean(achievementAlerts) }),
    ...(announcements !== undefined && { announcements: Boolean(announcements) }),
    ...(weeklySummary !== undefined && { weeklySummary: Boolean(weeklySummary) }),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: notificationSettingsTable.id })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.telegramId, telegramId));

  if (existing) {
    await db.update(notificationSettingsTable).set(values).where(eq(notificationSettingsTable.telegramId, telegramId));
  } else {
    await db.insert(notificationSettingsTable).values({
      telegramId,
      miningReminder: miningReminder !== undefined ? Boolean(miningReminder) : true,
      taskReminder: taskReminder !== undefined ? Boolean(taskReminder) : true,
      referralRewards: referralRewards !== undefined ? Boolean(referralRewards) : true,
      challengeAlerts: challengeAlerts !== undefined ? Boolean(challengeAlerts) : true,
      achievementAlerts: achievementAlerts !== undefined ? Boolean(achievementAlerts) : true,
      announcements: announcements !== undefined ? Boolean(announcements) : true,
      weeklySummary: weeklySummary !== undefined ? Boolean(weeklySummary) : false,
    });
  }

  res.json({ ok: true });
});

// ── POST /api/admin/notify ────────────────────────────────────────────────────
// Admin: send a notification to one user, or broadcast to all.
router.post("/admin/notify", async (req, res): Promise<void> => {
  const { adminTelegramId, targetTelegramId, title, message, type = "admin_announcement" } = req.body ?? {};
  if (adminTelegramId !== ADMIN_TELEGRAM_ID) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!title || !message) { res.status(400).json({ error: "title and message required" }); return; }

  if (targetTelegramId) {
    await createNotification({ telegramId: targetTelegramId, title, message, type });
    res.json({ ok: true, sent: 1 });
  } else {
    const allUsers = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
    await Promise.all(allUsers.map(u => createNotification({ telegramId: u.telegramId, title, message, type })));
    res.json({ ok: true, sent: allUsers.length });
  }
});

export default router;
