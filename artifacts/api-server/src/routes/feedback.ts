import { Router, type IRouter } from "express";
import { db, feedbackTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SubmitFeedbackBody, GetAdminFeedbackQueryParams, GetAdminFeedbackResponse } from "@workspace/api-zod";
import { ADMIN_TELEGRAM_ID } from "../lib/hustlecoin";

const router: IRouter = Router();

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fb] = await db.insert(feedbackTable).values({ telegramId: parsed.data.telegramId, message: parsed.data.message }).returning();

  res.status(201).json({ id: fb.id, telegramId: fb.telegramId, message: fb.message, adminReply: fb.adminReply ?? null, createdAt: fb.createdAt.toISOString() });
});

router.get("/admin/feedback", async (req, res): Promise<void> => {
  const parsed = GetAdminFeedbackQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.telegramId !== ADMIN_TELEGRAM_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const feedbacks = await db.select().from(feedbackTable);
  res.json(
    GetAdminFeedbackResponse.parse(
      feedbacks.map((f) => ({
        id: f.id,
        telegramId: f.telegramId,
        message: f.message,
        adminReply: f.adminReply ?? null,
        createdAt: f.createdAt.toISOString(),
      }))
    )
  );
});

export default router;
