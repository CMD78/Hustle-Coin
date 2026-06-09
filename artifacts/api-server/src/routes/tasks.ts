import { Router, type IRouter } from "express";
import { db, tasksTable, taskCompletionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetTasksQueryParams, GetTasksResponse,
  CompleteTaskParams, CompleteTaskBody, CompleteTaskResponse,
  CreateTaskBody, UpdateTaskParams, UpdateTaskBody, UpdateTaskResponse,
  ApproveTaskCompletionParams, ApproveTaskCompletionBody, ApproveTaskCompletionResponse,
} from "@workspace/api-zod";
import { ADMIN_TELEGRAM_ID, updateQuestProgress } from "../lib/hustlecoin";

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = GetTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { telegramId } = parsed.data;
  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.status, "active"));
  const completions = await db.select().from(taskCompletionsTable).where(eq(taskCompletionsTable.telegramId, telegramId));
  const completionMap = new Map(completions.map((c) => [c.taskId, c]));

  res.json(
    GetTasksResponse.parse(
      tasks.map((t) => {
        const c = completionMap.get(t.id);
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          reward: t.reward,
          link: t.link ?? null,
          status: t.status as "active" | "inactive",
          completed: !!c,
          approved: c ? !!c.approved : false,
          completedAt: c?.completedAt.toISOString() ?? null,
        };
      })
    )
  );
});

router.post("/tasks/:taskId/complete", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const params = CompleteTaskParams.safeParse({ taskId: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CompleteTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { telegramId } = body.data;
  const { taskId } = params.data;

  const [existing] = await db.select().from(taskCompletionsTable).where(and(eq(taskCompletionsTable.taskId, taskId), eq(taskCompletionsTable.telegramId, telegramId)));
  if (existing) {
    res.status(400).json({ error: "Task already completed" });
    return;
  }

  const [completion] = await db.insert(taskCompletionsTable).values({ taskId, telegramId, approved: 0 }).returning();
  await updateQuestProgress(telegramId, "complete_task");

  res.json(CompleteTaskResponse.parse({ id: completion.id, taskId: completion.taskId, telegramId: completion.telegramId, approved: !!completion.approved, completedAt: completion.completedAt.toISOString() }));
});

router.post("/admin/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.adminTelegramId !== ADMIN_TELEGRAM_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [task] = await db.insert(tasksTable).values({ title: parsed.data.title, description: parsed.data.description, reward: parsed.data.reward, link: parsed.data.link ?? null }).returning();
  res.status(201).json({ id: task.id, title: task.title, description: task.description, reward: task.reward, link: task.link ?? null, status: task.status, createdAt: task.createdAt.toISOString() });
});

router.patch("/admin/tasks/:taskId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const params = UpdateTaskParams.safeParse({ taskId: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.adminTelegramId !== ADMIN_TELEGRAM_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { adminTelegramId: _admin, ...updateData } = body.data;
  const [task] = await db.update(tasksTable).set(updateData).where(eq(tasksTable.id, params.data.taskId)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(UpdateTaskResponse.parse({ id: task.id, title: task.title, description: task.description, reward: task.reward, link: task.link ?? null, status: task.status as "active" | "inactive", createdAt: task.createdAt.toISOString() }));
});

router.post("/admin/tasks/:taskId/approve", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const params = ApproveTaskCompletionParams.safeParse({ taskId: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ApproveTaskCompletionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.adminTelegramId !== ADMIN_TELEGRAM_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { telegramId, taskId } = { telegramId: body.data.telegramId, taskId: params.data.taskId };
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [completion] = await db.update(taskCompletionsTable).set({ approved: 1 }).where(and(eq(taskCompletionsTable.taskId, taskId), eq(taskCompletionsTable.telegramId, telegramId))).returning();
  if (!completion) {
    res.status(404).json({ error: "Completion not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
  if (user) {
    await db.update(usersTable).set({ balance: user.balance + task.reward }).where(eq(usersTable.telegramId, telegramId));
  }

  res.json(ApproveTaskCompletionResponse.parse({ id: completion.id, taskId: completion.taskId, telegramId: completion.telegramId, approved: !!completion.approved, completedAt: completion.completedAt.toISOString() }));
});

export default router;
