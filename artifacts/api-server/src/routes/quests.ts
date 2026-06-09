import { Router, type IRouter } from "express";
import { db, questsTable, questProgressTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetQuestsQueryParams, GetQuestsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/quests", async (req, res): Promise<void> => {
  const parsed = GetQuestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId } = parsed.data;
  const today = new Date().toISOString().split("T")[0];
  const quests = await db.select().from(questsTable);

  const result = await Promise.all(
    quests.map(async (q) => {
      const [progress] = await db
        .select()
        .from(questProgressTable)
        .where(and(eq(questProgressTable.questId, q.id), eq(questProgressTable.telegramId, telegramId), eq(questProgressTable.date, today)));

      return {
        id: q.id,
        title: q.title,
        description: q.description,
        reward: q.reward,
        questType: q.questType as "mine" | "complete_task" | "invite_friend",
        completed: progress ? !!progress.completed : false,
        progress: progress?.progress ?? 0,
        target: q.target,
      };
    })
  );

  res.json(GetQuestsResponse.parse(result));
});

export default router;
