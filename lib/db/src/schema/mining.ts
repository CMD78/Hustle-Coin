import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const miningLogsTable = pgTable("mining_logs", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  hpEarned: integer("hp_earned").notNull().default(20),
  bonusHp: integer("bonus_hp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  minedAt: timestamp("mined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMiningLogSchema = createInsertSchema(miningLogsTable).omit({ id: true, minedAt: true });
export type InsertMiningLog = z.infer<typeof insertMiningLogSchema>;
export type MiningLog = typeof miningLogsTable.$inferSelect;
