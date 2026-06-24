import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, referralsTable, tasksTable, questsTable, achievementsTable, achievementUnlocksTable, taskCompletionsTable, questProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS, getLevel, getBadges, getMineCountdown, canMine, processReferral } from "../lib/hustlecoin";
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

function getWebAppUrl(): string {
  if (process.env.WEBAPP_URL) return process.env.WEBAPP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/hustle-coin`;
  return "https://hustlecoin.replit.app/hustle-coin";
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string, replyMarkup?: object): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Telegram Bot Webhook ─────────────────────────────────────────────────────
// Register this URL with BotFather: POST WEBAPP_URL/api/webhook
// Set webhook: GET /api/admin/register-webhook?telegramId=ADMIN_ID
router.post("/webhook", async (req, res): Promise<void> => {
  // Always respond 200 immediately — Telegram requires fast responses
  res.sendStatus(200);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const text: string = message.text ?? "";
    const from = message.from;

    if (!chatId || !from) return;

    req.log?.info({ update_id: update.update_id, text, from_id: from.id }, "[WEBHOOK] received Telegram update");

    // Handle /start command — the core referral trigger
    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const startParam = parts[1] ?? null; // This is the referrer's telegramId
      const userId = String(from.id);
      // Bug #2 fix: Telegram users are not required to have a @username.
      // Default to empty string to satisfy the DB notNull() constraint.
      const username = from.username || "";
      const firstName = from.first_name || "User";
      const lastName = from.last_name ?? null;

      req.log?.info({ userId, startParam, username }, "[WEBHOOK] /start command received");

      const hasValidRef = !!(startParam && startParam !== userId);

      // Create or fetch user
      let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId));
      const isNewUser = !user;

      if (!user) {
        const isAdmin = userId === ADMIN_TELEGRAM_ID;
        // Bug #2 fix: username defaults to "" so notNull() is never violated.
        // Bug #3 fix: write referredBy into the user row at creation time.
        [user] = await db.insert(usersTable).values({
          telegramId: userId,
          username,
          firstName,
          lastName,
          isAdmin,
          balance: 0,
          referredBy: hasValidRef ? startParam : null,
        }).returning();
        req.log?.info({ userId }, "[WEBHOOK] new user created");
      } else {
        await db.update(usersTable).set({ username: username || user.username, firstName, lastName, lastActive: new Date() }).where(eq(usersTable.telegramId, userId));
      }

      // Process referral using the centralized function (Bug #1/4 fix)
      if (isNewUser && hasValidRef) {
        const result = await processReferral(userId, startParam!, 0);

        if (result.credited) {
          req.log?.info({ userId, startParam }, "[WEBHOOK] ✅ referral credited via processReferral");
        } else if (result.reason === "referrer_not_found") {
          // Grant welcome bonus since referrer not in DB
          await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
          req.log?.info({ userId, startParam }, "[WEBHOOK] referrer not found — welcome bonus granted");
        } else {
          req.log?.info({ userId, startParam, reason: result.reason }, "[WEBHOOK] referral skipped");
        }
      } else if (isNewUser && !hasValidRef) {
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
        req.log?.info({ userId }, "[WEBHOOK] new user without referral — welcome bonus granted");
      }

      // Build the Mini App button URL.
      // Use the ?startapp= direct Mini App link so Telegram injects start_param
      // into tg.initDataUnsafe even when the user already has the bot chat open.
      // ?ref= is kept as a URL-param safety net in case start_param is missed.
      const botUsername = process.env.BOT_USERNAME ?? "HustleCoinMinerBot";
      const appShortname = process.env.APP_SHORTNAME ?? "HustleCoin";
      const baseDeepLink = `https://t.me/${botUsername}/${appShortname}`;
      const buttonUrl = hasValidRef
        ? `${baseDeepLink}?startapp=${startParam}`
        : baseDeepLink;

      const isReferred = isNewUser && hasValidRef;

      await sendTelegramMessage(botToken, chatId,
        isReferred
          ? `🎉 You've been invited to <b>HustleCoin</b>!\n\n+${REFEREE_REWARD} HC bonus has been credited to your account.\nYour friend also earned +${REFERRER_REWARD} HC! 🤝\n\nTap below to start mining and earning!`
          : `🚀 Welcome to <b>HustleCoin</b>!\n\nMine HC coins, complete tasks, and climb the leaderboard!\n\nTap below to open the app and start earning!`,
        {
          inline_keyboard: [[{
            text: "🎮 Open HustleCoin",
            web_app: { url: buttonUrl }
          }]]
        }
      );
    }

    // Handle /referral command — sends user their referral link
    if (text === "/referral" || text.startsWith("/referral@")) {
      const userId = String(from.id);
      const refBotUsername = process.env.BOT_USERNAME ?? "HustleCoinMinerBot";
      const refAppShortname = process.env.APP_SHORTNAME ?? "HustleCoin";
      // Use direct Mini App link so start_param is always injected by Telegram
      const referralLink = `https://t.me/${refBotUsername}/${refAppShortname}?startapp=${userId}`;
      await sendTelegramMessage(botToken, chatId,
        `🔗 Your referral link:\n\n<code>${referralLink}</code>\n\nShare this link with friends! You earn <b>+${REFERRER_REWARD} HC</b> for each friend who joins, and they get <b>+${REFEREE_REWARD} HC</b> as a welcome bonus!`
      );
    }

  } catch (err) {
    req.log?.error({ err }, "[WEBHOOK] error processing update");
  }
});

// ── Register Telegram webhook with BotFather ─────────────────────────────────
router.post("/admin/register-webhook", async (req, res): Promise<void> => {
  const adminId = String(req.body?.telegramId ?? req.query?.telegramId ?? "");
  if (adminId !== ADMIN_TELEGRAM_ID) { res.status(403).json({ error: "Forbidden" }); return; }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) { res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" }); return; }

  const providedUrl = req.body?.webhookUrl as string | undefined;
  const webAppUrl = providedUrl ?? getWebAppUrl();
  // Strip the /hustle-coin path to get the API base
  const apiBase = webAppUrl.replace(/\/hustle-coin.*$/, "");
  const webhookUrl = `${apiBase}/api/webhook`;

  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  });

  const data = await telegramRes.json() as any;
  req.log?.info({ webhookUrl, result: data }, "[WEBHOOK] setWebhook called");

  res.json({ webhookUrl, telegramResponse: data, webAppUrl });
});

// ── Get current webhook info ─────────────────────────────────────────────────
router.get("/admin/webhook-info", async (req, res): Promise<void> => {
  const adminId = String(req.query?.telegramId ?? "");
  if (adminId !== ADMIN_TELEGRAM_ID) { res.status(403).json({ error: "Forbidden" }); return; }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) { res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" }); return; }

  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const data = await telegramRes.json() as any;
  const webAppUrl = getWebAppUrl();

  res.json({
    webhookInfo: data.result,
    expectedWebhookUrl: `${webAppUrl.replace(/\/hustle-coin.*$/, "")}/api/webhook`,
    webAppUrl,
    configured: !!data.result?.url,
    webAppUrlEnvSet: !!process.env.WEBAPP_URL,
  });
});

// ── POST /telegram/start (legacy — called by external integrations) ───────────
router.post("/telegram/start", async (req, res): Promise<void> => {
  const { telegramId, username, firstName, lastName, startParameter, initData } = req.body;

  if (!telegramId) { res.status(400).json({ error: "telegramId is required" }); return; }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let initDataValid = false;
  if (botToken && initData) {
    initDataValid = verifyTelegramInitData(String(initData), botToken);
  }

  const referredBy = startParameter ? String(startParameter) : null;
  const safeUsername = (username as string | undefined) || "";

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
  const isNewUser = !user;

  if (!user) {
    const isAdmin = String(telegramId) === ADMIN_TELEGRAM_ID;
    // Bug #2 fix: username defaults to "" so notNull() is never violated.
    // Bug #3 fix: write referredBy into the user row at creation time.
    [user] = await db
      .insert(usersTable)
      .values({
        telegramId: String(telegramId),
        username: safeUsername,
        firstName: (firstName as string | undefined) || "User",
        lastName: (lastName as string | undefined) ?? null,
        isAdmin,
        balance: 0,
        referredBy: referredBy && referredBy !== String(telegramId) ? referredBy : null,
      })
      .returning();

    if (referredBy && referredBy !== String(telegramId)) {
      const result = await processReferral(String(telegramId), referredBy, 0);
      if (result.reason === "referrer_not_found") {
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, String(telegramId)));
      }
      if (result.credited) {
        [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
      }
    } else {
      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, String(telegramId)));
      [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, String(telegramId)));
    }
  } else {
    if (user.isBanned) { res.status(403).json({ error: "Account is banned" }); return; }
    await db.update(usersTable).set({ username: safeUsername || user.username, firstName: (firstName as string | undefined) || user.firstName, lastActive: new Date() }).where(eq(usersTable.telegramId, String(telegramId)));
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

  const webAppUrl = getWebAppUrl();

  res.json({
    version: "HustleCoin Beta v1.0",
    botConfigured: !!botToken,
    botUsername: botUsername ?? null,
    miniAppUrl: botUsername ? `https://t.me/${botUsername}` : null,
    webAppUrl,
    webhookUrl: `${webAppUrl.replace(/\/hustle-coin.*$/, "")}/api/webhook`,
    deepLinkExample: botUsername ? `https://t.me/${botUsername}/${process.env.APP_SHORTNAME ?? "HustleCoin"}?startapp=USER_ID` : null,
    hmacSupported: true,
    botCommands: [
      { command: "/start", description: "Start HustleCoin Mini App" },
      { command: "/referral", description: "Get your referral link" },
      { command: "/app", description: "Open HustleCoin" },
      { command: "/tasks", description: "View available tasks" },
      { command: "/community", description: "Join the community" },
      { command: "/help", description: "Get help and support" },
    ],
    hmacVerification: "Supported — validate initData with BOT_TOKEN secret",
    database: { connected: dbConnected, userCount, mineCount, refCount, taskCount, questCount, achievementCount },
    adminId: ADMIN_TELEGRAM_ID,
    webAppUrlEnvSet: !!process.env.WEBAPP_URL,
    setupInstructions: [
      "1. Set WEBAPP_URL env var to your deployed app URL (e.g. https://yourapp.replit.app)",
      "2. Call POST /api/admin/register-webhook?telegramId=ADMIN_ID to register the bot webhook",
      "3. The webhook URL will be WEBAPP_URL/api/webhook",
      "4. In BotFather → /setmenubutton → set URL to your deployed app",
      "5. Referral links: https://t.me/BOT?start=USER_ID — the webhook handles the rest",
    ],
  });
});

export default router;
