import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID } from "../lib/hustlecoin";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  telegram_channel: "https://t.me/HustleCoin_HSL",
  telegram_community: "https://t.me/HustleCoinHSL",
  twitter_url: "https://x.com/hustlecoin_HSL",
  tiktok_url: "https://www.tiktok.com/@hustlecoin0",
  bot_username: "HustleCoinMinerBot",
  app_name: "HustleCoin",
  // Mini App shortname registered in BotFather via /newapp.
  // Used to generate t.me/BOT/SHORTNAME?startapp= referral links.
  app_shortname: "HustleCoin",
  version: "Beta v1.0",
};

router.get("/settings", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(settingsTable);
    const result: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      result[row.key] = row.value;
    }
    res.json(result);
  } catch {
    res.json(DEFAULT_SETTINGS);
  }
});

router.put("/admin/settings", async (req, res): Promise<void> => {
  const adminId = req.body?.telegramId ?? req.query?.telegramId;
  if (adminId !== ADMIN_TELEGRAM_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { updates } = req.body as { updates: Record<string, string> };
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Invalid updates" });
    return;
  }

  const saved: Record<string, string> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length > 0) {
      await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value });
    }
    saved[key] = value;
  }

  res.json({ success: true, updated: saved });
});

export async function seedDefaultSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length === 0) {
      await db.insert(settingsTable).values({ key, value });
    }
  }
}

export default router;
