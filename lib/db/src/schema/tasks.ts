import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reward: integer("reward").notNull().default(50),
  link: text("link"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskCompletionsTable = pgTable("task_completions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  approved: integer("approved").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const insertTaskCompletionSchema = createInsertSchema(taskCompletionsTable).omit({ id: true, completedAt: true });
export type InsertTaskCompletion = z.infer<typeof insertTaskCompletionSchema>;
export type TaskCompletion = typeof taskCompletionsTable.$inferSelect;
