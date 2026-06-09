import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  adminTelegramId: text("admin_telegram_id").notNull(),
  action: text("action").notNull(),
  targetTelegramId: text("target_telegram_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  adminTelegramId: text("admin_telegram_id").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("broadcast"),
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedUntil: timestamp("pinned_until", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminLogSchema = createInsertSchema(adminLogsTable).omit({ id: true, createdAt: true });
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;
export type AdminLog = typeof adminLogsTable.$inferSelect;

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true, sentAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
