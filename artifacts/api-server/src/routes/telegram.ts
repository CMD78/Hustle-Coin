import { Router, type IRouter } from "express";
import { db, usersTable, miningLogsTable, referralsTable, tasksTable, questsTable, achievementsTable, achievementUnlocksTable, taskCompletionsTable, questProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADMIN_TELEGRAM_ID, REFERRER_REWARD, REFEREE_REWARD, WELCOME_BONUS, getLevel, getBadges, getMineCountdown, canMine, processReferral, logReferralEvent } from "../lib/hustlecoin";
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
// Register via: POST /api/admin/register-webhook?telegramId=ADMIN_ID
//
// Referral design:
//   - NEW users with a start_param → processReferral immediately.
//   - NEW users without start_param → welcome bonus only.
//   - EXISTING users → profile update + send "Open App" button.
//     Referral processing for existing users is the sole responsibility of
//     /api/init (called when the user actually opens the Mini App). Handling
//     referrals here too would duplicate the second-pass logic and create
//     inconsistent behaviour.
// ─────────────────────────────────────────────────────────────────────────────
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

    // ── Handle /start command ────────────────────────────────────────────────
    if (text.startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      const startParam = parts[1] ?? null; // referrer's telegramId when present
      const userId = String(from.id);
      const username = from.username || "";
      const firstName = from.first_name || "User";
      const lastName = from.last_name ?? null;

      const hasValidRef = !!(startParam && startParam !== userId);

      req.log?.info({ userId, startParam, hasValidRef }, "[WEBHOOK] /start command");

      // Log referral link click if a start_param is present
      if (hasValidRef) {
        await logReferralEvent({
          referrerTelegramId: startParam!,
          refereeTelegramId: userId,
          step: "link_opened",
          result: "success",
          message: `startapp=${startParam} received via bot /start`,
          source: "webhook",
        });
      }

      let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId));
      const isNewUser = !user;

      let referralCredited = false;
      let webhookReferralStatus = "no_referral";

      if (!user) {
        // ── New user ──────────────────────────────────────────────────────────
        const isAdmin = userId === ADMIN_TELEGRAM_ID;
        [user] = await db.insert(usersTable).values({
          telegramId: userId,
          username,
          firstName,
          lastName,
          isAdmin,
          balance: 0,
          referredBy: hasValidRef ? startParam : null,
        }).returning();

        req.log?.info({ userId, referredBy: hasValidRef ? startParam : null }, "[WEBHOOK] new user created");

        if (hasValidRef) {
          await logReferralEvent({
            referrerTelegramId: startParam!,
            refereeTelegramId: userId,
            step: "referrer_stored",
            result: "success",
            message: `referredBy=${startParam} stored for new user via webhook`,
            source: "webhook",
          });

          const result = await processReferral(userId, startParam!, "webhook");

          if (result.credited) {
            referralCredited = true;
            webhookReferralStatus = "credited";
            req.log?.info({ userId, startParam }, "[WEBHOOK] ✅ referral credited");
          } else if (result.reason === "referrer_not_found") {
            await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
            webhookReferralStatus = "skipped_referrer_not_found";
            req.log?.info({ userId, startParam }, "[WEBHOOK] referrer not found — welcome bonus granted");
          } else {
            await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
            webhookReferralStatus = `skipped_${result.reason ?? "unknown"}`;
            req.log?.info({ userId, startParam, reason: result.reason }, "[WEBHOOK] referral skipped — welcome bonus granted");
          }

        } else {
          await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
          webhookReferralStatus = "welcome_bonus_only";
          req.log?.info({ userId }, "[WEBHOOK] new user without referral — welcome bonus granted");
        }

      } else {
        // ── Existing user ─────────────────────────────────────────────────────
        // Only update profile. Referral second-pass is handled by /api/init
        // when the user actually opens the Mini App. Doing it here too would
        // create duplicate processing and inconsistent results.
        await db.update(usersTable)
          .set({ username: username || user.username, firstName, lastName, lastActive: new Date() })
          .where(eq(usersTable.telegramId, userId));

        req.log?.info({ userId }, "[WEBHOOK] existing user — profile updated, referral deferred to /api/init");
      }

      // Build the Mini App deep-link URL
      const botUsername = process.env.BOT_USERNAME ?? "HustleCoinMinerBot";
      const appShortname = process.env.APP_SHORTNAME ?? "HustleCoin";
      const baseDeepLink = `https://t.me/${botUsername}/${appShortname}`;
      const buttonUrl = hasValidRef ? `${baseDeepLink}?startapp=${startParam}` : baseDeepLink;

      await sendTelegramMessage(
        botToken,
        chatId,
        referralCredited
          ? `🎉 You've been invited to <b>HustleCoin</b>!\n\n+${REFEREE_REWARD} HC bonus has been credited to your account.\nYour friend also earned +${REFERRER_REWARD} HC! 🤝\n\nTap below to start mining and earning!`
          : `🚀 Welcome to <b>HustleCoin</b>!\n\nMine HC coins, complete tasks, and climb the leaderboard!\n\nTap below to open the app and start earning!`,
        {
          inline_keyboard: [[{
            text: "🎮 Open HustleCoin",
            web_app: { url: buttonUrl }
          }]]
        }
      );

      req.log?.info({ userId, webhookReferralStatus, isNewUser }, "[WEBHOOK] /start handling complete");
    }

    // ── Handle /referral command ─────────────────────────────────────────────
    if (text === "/referral" || text.startsWith("/referral@")) {
      const userId = String(from.id);
      const refBotUsername = process.env.BOT_USERNAME ?? "HustleCoinMinerBot";
      const refAppShortname = process.env.APP_SHORTNAME ?? "HustleCoin";
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

// ── POST /telegram/start ─────────────────────────────────────────────────────
// Legacy endpoint kept for external integrations.
// New users: creates account + processes referral (same as webhook /start).
// Existing users: profile update only — referral second-pass deferred to /api/init.
router.post("/telegram/start", async (req, res): Promise<void> => {
  const { telegramId, username, firstName, lastName, startParameter, initData } = req.body;

  if (!telegramId) { res.status(400).json({ error: "telegramId is required" }); return; }

  const userId = String(telegramId);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let initDataValid = false;
  if (botToken && initData) {
    initDataValid = verifyTelegramInitData(String(initData), botToken);
  }

  const referredByRaw = startParameter ? String(startParameter) : null;
  const safeUsername = (username as string | undefined) || "";
  const safeFirstName = (firstName as string | undefined) || "User";
  const safeLastName = (lastName as string | undefined) ?? null;
  const hasValidRef = !!(referredByRaw && referredByRaw !== userId);

  req.log?.info({ userId, referredBy: referredByRaw, initDataValid }, "[TELEGRAM_START] request received");

  let [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId));
  const isNewUser = !user;
  let referralStatus = "no_referral";

  if (!user) {
    const isAdmin = userId === ADMIN_TELEGRAM_ID;
    const effectiveReferredBy = hasValidRef ? referredByRaw : null;

    [user] = await db
      .insert(usersTable)
      .values({
        telegramId: userId,
        username: safeUsername,
        firstName: safeFirstName,
        lastName: safeLastName,
        isAdmin,
        balance: 0,
        referredBy: effectiveReferredBy,
      })
      .returning();

    req.log?.info({ userId, referredBy: effectiveReferredBy }, "[TELEGRAM_START] new user created");

    if (effectiveReferredBy) {
      await logReferralEvent({
        referrerTelegramId: effectiveReferredBy,
        refereeTelegramId: userId,
        step: "referrer_stored",
        result: "success",
        message: `referredBy=${effectiveReferredBy} stored via /telegram/start`,
        source: "telegram_start",
      });

      const result = await processReferral(userId, effectiveReferredBy, "telegram_start");

      if (result.credited) {
        referralStatus = "credited";
        req.log?.info({ userId, referredBy: effectiveReferredBy }, "[TELEGRAM_START] ✅ referral credited");
      } else {
        referralStatus = `skipped_${result.reason ?? "unknown"}`;
        req.log?.info({ userId, reason: result.reason }, "[TELEGRAM_START] referral skipped — welcome bonus");
      }
      if (referralStatus !== "credited") {
        await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
      }
    } else {
      referralStatus = "welcome_bonus_only";
      await db.update(usersTable).set({ balance: WELCOME_BONUS }).where(eq(usersTable.telegramId, userId));
      req.log?.info({ userId }, "[TELEGRAM_START] no referral — welcome bonus granted");
    }

    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId));

  } else {
    // Existing user — profile update only
    if (user.isBanned) { res.status(403).json({ error: "Account is banned" }); return; }

    await db.update(usersTable)
      .set({ username: safeUsername || user.username, firstName: safeFirstName, lastActive: new Date() })
      .where(eq(usersTable.telegramId, userId));

    [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId));
    req.log?.info({ userId }, "[TELEGRAM_START] existing user — profile updated, referral deferred to /api/init");
  }

  const referralCount = (await db.select().from(referralsTable).where(eq(referralsTable.referrerTelegramId, userId))).length;
  const achievementCount = (await db.select().from(achievementUnlocksTable).where(eq(achievementUnlocksTable.telegramId, userId))).length;
  const mineCountdown = getMineCountdown(user.lastMine);
  const userCanMine = canMine(user.lastMine);

  req.log?.info({ userId, final_balance: user.balance, referralStatus }, "[TELEGRAM_START] complete");

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
    referredBy: referredByRaw ?? null,
    referralStatus,
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
      "5. Referral links: https://t.me/BOT/APP?startapp=USER_ID — the Mini App injects start_param",
    ],
  });
});

export default router;
