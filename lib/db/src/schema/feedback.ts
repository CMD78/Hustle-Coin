import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  message: text("message").notNull(),
  adminReply: text("admin_reply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, createdAt: true, adminReply: true });
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type FeedbackRow = typeof feedbackTable.$inferSelect;
