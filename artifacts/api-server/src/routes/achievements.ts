import { Router, type IRouter } from "express";
import { db, achievementsTable, achievementUnlocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetAchievementsQueryParams, GetAchievementsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/achievements", async (req, res): Promise<void> => {
  const parsed = GetAchievementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId } = parsed.data;
  const achievements = await db.select().from(achievementsTable);
  const unlocks = await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, telegramId));
  const unlockMap = new Map(unlocks.map((u) => [u.achievementId, u]));

  res.json(
    GetAchievementsResponse.parse(
      achievements.map((a) => {
        const unlock = unlockMap.get(a.id);
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          icon: a.icon,
          unlocked: !!unlock,
          unlockedAt: unlock?.unlockedAt.toISOString() ?? null,
        };
      })
    )
  );
});

export default router;
