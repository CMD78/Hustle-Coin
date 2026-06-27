import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  read: boolean("read").notNull().default(false),
  relatedEntity: text("related_entity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationSettingsTable = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  miningReminder: boolean("mining_reminder").notNull().default(true),
  taskReminder: boolean("task_reminder").notNull().default(true),
  referralRewards: boolean("referral_rewards").notNull().default(true),
  challengeAlerts: boolean("challenge_alerts").notNull().default(true),
  achievementAlerts: boolean("achievement_alerts").notNull().default(true),
  announcements: boolean("announcements").notNull().default(true),
  weeklySummary: boolean("weekly_summary").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
