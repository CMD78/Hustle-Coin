import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, referralsTable, tasksTable, questsTable, achievementsTable, achievementUnlocksTable, taskCompletionsTable, questProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS, getLevel, getBadges, getMineCountdown, canMine } from "../lib/hustlecoin";
import crypto from "crypto";

const router: IRouter = Router();

function verifyTelegramInitData(initData: string, botToken: string): boolean {
  try {
    const data = new URLSearchParams(initData);
    const hash = data.get("hash");
    if (!hash) return false;
    data.delete("hash");
    const dataCheckString = [...data.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return hash === computedHash;
  } catch {
    return false;
  }
}

router.post("/telegram/start", async (req, res): Promise<void> => {
  const { telegramId, username, firstName, lastName, startParameter, initData } = req.body;

  if (!telegramId) { res.status(400).json({ error: "telegramId is required" }); return; }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let initDataValid = false;
  if (botToken && initData) {
    initDataValid = verifyTelegramInitData(String(initData), botToken);
  }

  const referredBy = startParameter ?? null;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
  const isNewUser = !user;

  if (!user) {
    const isAdmin = String(telegramId) === ADMIN_TELEGRAM_ID;
    [user] = await db
      .insert(usersTable)
      .values({ telegramId: String(telegramId), username: username ?? null, firstName: firstName ?? "User", lastName: lastName ?? null, isAdmin, balance: 0 })
      .returning();

    if (referredBy && String(referredBy) !== String(telegramId)) {
      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(referredBy)));
      if (referrer) {
        const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.refereeTelegramId, String(telegramId)));
        if (!existing) {
          await db.insert(referralsTable).values({
            referrerTelegramId: String(referredBy),
            refereeTelegramId: String(telegramId),
            referrerHpEarned: REFERRER_REWARD,
            refereeHpEarned: REFEREE_REWARD,
          });
          await db.update(usersTable).set({ balance: referrer.balance + REFERRER_REWARD }).where(eq(usersTable.telegramId, String(referredBy)));
          await db.update(usersTable).set({ balance: REFEREE_REWARD }).where(eq(usersTable.telegramId, String(telegramId)));
          [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
        }
      }
    } else {
      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, String(telegramId)));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
    }
  } else {
    if (user.isBanned) { res.status(403).json({ error: "Account is banned" }); return; }
    await db.update(usersTable).set({ username: username ?? user.username, firstName: firstName ?? user.firstName, lastActive: new Date() }).where(eq(usersTable.telegramId, String(telegramId)));
    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
  }

  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, String(telegramId)))).length;
  const achievementCount = (await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, String(telegramId)))).length;
  const mineCountdown = getMineCountdown(user.lastMine);
  const userCanMine = canMine(user.lastMine);

  res.json({
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    balance: user.balance,
    level: getLevel(user.balance),
    streak: user.streak,
    totalMines: user.totalMines,
    lastMine: user.lastMine?.toISOString() ?? null,
    canMine: userCanMine,
    mineCountdown: userCanMine ? null : mineCountdown,
    referralCount,
    achievementCount,
    joinDate: user.joinDate.toISOString(),
    badges: getBadges({ streak: user.streak, referralCount, balance: user.balance, totalMines: user.totalMines }),
    isNewUser,
    initDataValid,
    referredBy: referredBy ?? null,
  });
});

router.get("/telegram-status", async (req, res): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const botUsername = process.env.BOT_USERNAME ?? process.env.TELEGRAM_BOT_USERNAME;

  let dbConnected = false;
  let userCount = 0;
  try {
    const result = await db.select().from(usersTable);
    userCount = result.length;
    dbConnected = true;
  } catch {}

  let taskCount = 0;
  try { taskCount = (await db.select().from(tasksTable)).length; } catch {}

  let questCount = 0;
  try { questCount = (await db.select().from(questsTable)).length; } catch {}

  let achievementCount = 0;
  try { achievementCount = (await db.select().from(achievementsTable)).length; } catch {}

  const mineCount = dbConnected ? (await db.select().from(miningLogsTable)).length : 0;
  const refCount = dbConnected ? (await db.select().from(referralsTable)).length : 0;

  res.json({
    version: "HustleCoin Beta v1.0",
    botConfigured: !!botToken,
    botUsername: botUsername ?? null,
    miniAppUrl: botUsername ? `https://t.me/${botUsername}` : null,
    deepLinkExample: botUsername ? `https://t.me/${botUsername}?start=USER_ID` : null,
    hmacSupported: true,
    botCommands: [
      { command: "/start", description: "Start HustleCoin Mini App" },
      { command: "/app", description: "Open HustleCoin" },
      { command: "/tasks", description: "View available tasks" },
      { command: "/referral", description: "Get your referral link" },
      { command: "/community", description: "Join the community" },
      { command: "/help", description: "Get help and support" },
    ],
    hmacVerification: "Supported — validate initData with BOT_TOKEN secret",
    database: { connected: dbConnected, userCount, mineCount, refCount, taskCount, questCount, achievementCount },
    adminId: ADMIN_TELEGRAM_ID,
    setupInstructions: [
      "1. Create a bot via @BotFather → /newbot",
      "2. Copy the bot token and set TELEGRAM_BOT_TOKEN env var",
      "3. Set BOT_USERNAME env var (without @)",
      "4. In BotFather → /setmenubutton → set URL to your deployed app",
      "5. In BotFather → /setcommands → paste the bot commands above",
      "6. Deploy and share your Mini App link!",
    ],
  });
});

export default router;
