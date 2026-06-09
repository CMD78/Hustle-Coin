import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const achievementUnlocksTable = pgTable("achievement_unlocks", {
  id: serial("id").primaryKey(),
  achievementId: serial("achievement_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAchievementSchema = createInsertSchema(achievementsTable).omit({ id: true, createdAt: true });
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievementsTable.$inferSelect;

export const insertAchievementUnlockSchema = createInsertSchema(achievementUnlocksTable).omit({ id: true, unlockedAt: true });
export type InsertAchievementUnlock = z.infer<typeof insertAchievementUnlockSchema>;
export type AchievementUnlock = typeof achievementUnlocksTable.$inferSelect;
