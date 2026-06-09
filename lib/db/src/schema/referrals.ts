import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerTelegramId: text("referrer_telegram_id").notNull(),
  refereeTelegramId: text("referee_telegram_id").notNull().unique(),
  referrerHpEarned: integer("referrer_hp_earned").notNull().default(50),
  refereeHpEarned: integer("referee_hp_earned").notNull().default(25),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
