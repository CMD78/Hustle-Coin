import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, miningLogsTable } from "@workspace/db";
import { desc, sql, count } from "drizzle-orm";
import { GetLeaderboardQueryParams, GetLeaderboardResponse } from "@workspace/api-zod";
import { getBadges } from "../lib/hustlecoin";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, limit } = parsed.data;
  const lim = limit ?? 50;

  let entries: { rank: number; telegramId: string; username: string; firstName: string; value: number; badge: string | null }[] = [];

  if (type === "hp" || type === undefined) {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.balance)).limit(lim);
    entries = users.map((u, i) => ({
      rank: i + 1,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      value: u.balance,
      badge: null,
    }));
  } else if (type === "referrals") {
    const result = await db.execute(sql`
      SELECT u.telegram_id, u.username, u.first_name, COUNT(r.id)::int as ref_count
      FROM ${usersTable} u
      LEFT JOIN ${referralsTable} r ON r.referrer_telegram_id = u.telegram_id
      GROUP BY u.telegram_id, u.username, u.first_name
      ORDER BY ref_count DESC
      LIMIT ${lim}
    `);
    entries = (result.rows as Array<{ telegram_id: string; username: string; first_name: string; ref_count: number }>).map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegram_id,
      username: r.username,
      firstName: r.first_name,
      value: r.ref_count,
      badge: null,
    }));
  } else if (type === "streak") {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.streak)).limit(lim);
    entries = users.map((u, i) => ({
      rank: i + 1,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      value: u.streak,
      badge: null,
    }));
  } else if (type === "mining") {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.totalMines)).limit(lim);
    entries = users.map((u, i) => ({
      rank: i + 1,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      value: u.totalMines,
      badge: null,
    }));
  }

  res.json(GetLeaderboardResponse.parse(entries));
});

export default router;
