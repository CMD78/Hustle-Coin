import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questsTable = pgTable("quests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reward: integer("reward").notNull().default(10),
  questType: text("quest_type").notNull(),
  target: integer("target").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questProgressTable = pgTable("quest_progress", {
  id: serial("id").primaryKey(),
  questId: integer("quest_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  progress: integer("progress").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  date: text("date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestSchema = createInsertSchema(questsTable).omit({ id: true, createdAt: true });
export type InsertQuest = z.infer<typeof insertQuestSchema>;
export type Quest = typeof questsTable.$inferSelect;

export const insertQuestProgressSchema = createInsertSchema(questProgressTable).omit({ id: true, updatedAt: true });
export type InsertQuestProgress = z.infer<typeof insertQuestProgressSchema>;
export type QuestProgress = typeof questProgressTable.$inferSelect;
