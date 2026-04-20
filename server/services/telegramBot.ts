/**
 * Telegram Bot Service
 * - Multi-bot management (one bot per admin)
 * - Player registration with phone number + country restriction
 * - Invite code sharing
 * - Full menu: Deposit, Withdraw, Games, Bonus, Settings
 * - Message cleanup
 * - Real-time notifications via WebSocket bridge
 * - Robust startup with getMe validation + deleteWebhook
 * - Polling error auto-recovery
 * - Diagnostic status tracking
 */

import TelegramBot from "node-telegram-bot-api";
import { getDb } from "../db";
import * as db from "../db";
import {
  telegramBots,
  players,
  telegramBotMessages,
  adminAccounts,
  systemSettings,
  bankCatalog,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, generateAutoLoginToken } from "./auth";
import { nanoid } from "nanoid";
import { generateMiddlewavePlayerId } from "./playerId";
import {
  canCreateDeposit,
  createDeposit,
  checkWithdrawalConditions,
  createWithdrawal,
} from "./depositCycle";
import { claimBonus } from "./bonus";
import { getMiddlewaveConfig, loginGame, getGameList, getActiveProviders, getProjectInfo } from "./middlewave";
import {
  notifyAdminNewDeposit,
  notifyAdminNewWithdrawal,
} from "./websocket";

// Active bot instances: Map<botId, TelegramBot>
const activeBots = new Map<number, TelegramBot>();

// Track messages for cleanup: Map<chatId, messageId[]>
const chatMessages = new Map<number, number[]>();
// Prevent duplicate /start handling (e.g. webhook retry / duplicated update delivery)
const recentStartEvents = new Map<number, { messageId: number; at: number }>();
// Prevent duplicate callback handling (same click/update delivered multiple times)
const recentCallbackEvents = new Map<number, { queryId: string; data: string; at: number }>();
const START_DEDUPE_WINDOW_MS = 10_000;
const CALLBACK_DEDUPE_WINDOW_MS = 8_000;

// Bot diagnostic info: Map<botId, DiagnosticInfo>
interface BotDiagnosticInfo {
  botId: number;
  botUsername: string | null;
  startedAt: number;
  lastMessageAt: number | null;
  lastStartHandledAt: number | null;
  messageCount: number;
  pollingErrorCount: number;
  lastPollingError: string | null;
  lastPollingErrorAt: number | null;
  isPolling: boolean;
}
const botDiagnostics = new Map<number, BotDiagnosticInfo>();

// Backoff state for auto-recovery: Map<botId, { attempts, timer }>
const backoffState = new Map<number, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();
const MAX_BACKOFF_MS = 60_000; // 1 minute max
const BASE_BACKOFF_MS = 2_000; // 2 seconds base

function scheduleRestart(botId: number) {
  const state = backoffState.get(botId) || { attempts: 0, timer: null };
  if (state.timer) clearTimeout(state.timer);
  state.attempts++;
  // Exponential backoff with jitter: min(base * 2^attempts + jitter, max)
  const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, state.attempts - 1) + Math.random() * 1000, MAX_BACKOFF_MS);
  console.log(`[TG Bot] Scheduling restart for bot ${botId} in ${(delay / 1000).toFixed(1)}s (attempt ${state.attempts})`);
  state.timer = setTimeout(async () => {
    try {
      console.log(`[TG Bot] Auto-restarting bot ${botId} (attempt ${state.attempts})...`);
      await restartBot(botId);
      // Reset backoff on successful restart
      const diag = botDiagnostics.get(botId);
      if (diag) diag.isPolling = true;
    } catch (err: any) {
      console.error(`[TG Bot] Auto-restart failed for bot ${botId}: ${err.message}`);
    }
  }, delay);
  backoffState.set(botId, state);
}

function resetBackoff(botId: number) {
  const state = backoffState.get(botId);
  if (state) {
    if (state.timer) clearTimeout(state.timer);
    backoffState.delete(botId);
  }
}

// ─── Bot Lifecycle ───

export async function startAllBots() {
  const database = await getDb();
  if (!database) return;

  const bots = await database
    .select()
    .from(telegramBots)
    .where(eq(telegramBots.isActive, true));

  let startedCount = 0;
  for (const bot of bots) {
    try {
      const success = await startBot(bot);
      if (success) startedCount++;
    } catch (err) {
      console.error(`[TG Bot] Failed to start bot ${bot.id}:`, err);
    }
  }
  console.log(`[TG Bot] Started ${startedCount}/${bots.length} bots`);
}

export async function startBot(botConfig: any): Promise<boolean> {
  if (activeBots.has(botConfig.id)) {
    // Stop existing instance first
    await stopBot(botConfig.id);
  }

  if (!botConfig.botToken) {
    console.warn(`[TG Bot] Bot ${botConfig.id} has no token`);
    return false;
  }

  try {
    // Step 1: Validate token with getMe() BEFORE starting polling
    console.log(`[TG Bot] Validating token for bot ${botConfig.botName || botConfig.id}...`);
    const tempBot = new TelegramBot(botConfig.botToken);
    let botInfo: TelegramBot.User;
    try {
      botInfo = await tempBot.getMe();
      console.log(`[TG Bot] Token valid: @${botInfo.username} (${botInfo.first_name})`);
    } catch (err: any) {
      console.error(`[TG Bot] Token validation FAILED for bot ${botConfig.id}: ${err.message}`);
      return false;
    }

    // Step 2: Delete any existing webhook to ensure clean polling
    try {
      await tempBot.deleteWebHook();
      console.log(`[TG Bot] Webhook cleared for @${botInfo.username}`);
    } catch (err: any) {
      console.warn(`[TG Bot] Failed to clear webhook: ${err.message}`);
    }

    // Step 3: Save botUsername to DB if not already set
    if (botInfo.username && botInfo.username !== botConfig.botUsername) {
      try {
        const database = await getDb();
        if (database) {
          await database
            .update(telegramBots)
            .set({ botUsername: botInfo.username })
            .where(eq(telegramBots.id, botConfig.id));
          console.log(`[TG Bot] Saved username @${botInfo.username} to DB`);
        }
      } catch (err: any) {
        console.warn(`[TG Bot] Failed to save username: ${err.message}`);
      }
    }

    // Step 4: Start polling with the validated token
    const bot = new TelegramBot(botConfig.botToken, {
      polling: {
        autoStart: true,
        params: {
          timeout: 30,
          allowed_updates: ["message", "callback_query", "inline_query"],
        },
      },
    });

    // Initialize diagnostics
    botDiagnostics.set(botConfig.id, {
      botId: botConfig.id,
      botUsername: botInfo.username || null,
      startedAt: Date.now(),
      lastMessageAt: null,
      lastStartHandledAt: null,
      messageCount: 0,
      pollingErrorCount: 0,
      lastPollingError: null,
      lastPollingErrorAt: null,
      isPolling: true,
    });

    // Reset backoff on successful start
    resetBackoff(botConfig.id);

    // Register all handlers
    registerHandlers(bot, botConfig);

    activeBots.set(botConfig.id, bot);
    console.log(
      `[TG Bot] Bot @${botInfo.username} (${botConfig.botName || botConfig.id}) started polling (admin: ${botConfig.adminId})`
    );
    return true;
  } catch (err) {
    console.error(`[TG Bot] Error starting bot ${botConfig.id}:`, err);
    return false;
  }
}

export async function stopBot(botId: number) {
  const bot = activeBots.get(botId);
  if (bot) {
    try {
      await bot.stopPolling();
      console.log(`[TG Bot] Bot ${botId} polling stopped`);
    } catch (err: any) {
      console.warn(`[TG Bot] Error stopping bot ${botId}: ${err.message}`);
    }
    activeBots.delete(botId);
    botDiagnostics.delete(botId);
  }
}

export async function restartBot(botId: number) {
  const database = await getDb();
  if (!database) return;

  const [botConfig] = await database
    .select()
    .from(telegramBots)
    .where(eq(telegramBots.id, botId));
  if (botConfig) await startBot(botConfig);
}

// ─── Diagnostics ───

export function getBotStatus(botId: number): BotDiagnosticInfo | null {
  return botDiagnostics.get(botId) || null;
}

export function getAllBotStatuses(): BotDiagnosticInfo[] {
  return Array.from(botDiagnostics.values());
}

// ─── Message Tracking & Cleanup ───

function trackMessage(chatId: number, messageId: number) {
  const msgs = chatMessages.get(chatId) || [];
  msgs.push(messageId);
  // Keep only last 50 messages
  if (msgs.length > 50) msgs.splice(0, msgs.length - 50);
  chatMessages.set(chatId, msgs);
}

async function cleanupMessages(bot: TelegramBot, chatId: number, keepLast = 1) {
  const msgs = chatMessages.get(chatId) || [];
  const toDelete = keepLast <= 0 ? [...msgs] : msgs.slice(0, -keepLast);
  for (const msgId of toDelete) {
    try {
      await bot.deleteMessage(chatId, msgId);
    } catch {}
  }
  chatMessages.set(chatId, keepLast <= 0 ? [] : msgs.slice(-keepLast));
}

async function sendAndTrack(
  bot: TelegramBot,
  chatId: number,
  text: string,
  options?: any
): Promise<TelegramBot.Message> {
  const msg = await bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    ...options,
  });
  trackMessage(chatId, msg.message_id);
  return msg;
}

function buildLoginUrlFromBase(base: string, token: string): string {
  const raw = String(base || "").trim();
  if (!raw) return "";
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(normalized);
    u.pathname = "/login";
    u.search = `token=${encodeURIComponent(token)}`;
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

async function resolvePlayerAutoLoginUrl(adminId: number, botConfig: any, token: string): Promise<string> {
  const fromBot = buildLoginUrlFromBase((botConfig as any)?.frontendUrl || "", token);
  if (fromBot) return fromBot;

  try {
    const acl = await db.getDomainAcl(adminId);
    const playerDomain = acl.find((d: any) => d.isActive && (d.purpose === "player" || d.purpose === "both"))?.domain;
    const fromAcl = buildLoginUrlFromBase(playerDomain || "", token);
    if (fromAcl) return fromAcl;
  } catch {}

  const fromEnv = buildLoginUrlFromBase(process.env.FRONTEND_URL || "", token);
  if (fromEnv) return fromEnv;

  return "";
}

// ─── Handler Registration ───

function registerHandlers(bot: TelegramBot, botConfig: any) {
  const adminId = botConfig.adminId;
  const botLabel = `TG Bot ${botConfig.id}`;

  const clearChatPendingState = (chatId: number) => {
    pendingRegistrations.delete(chatId);
    pendingBankSelection.delete(chatId);
    pendingDeposits.delete(chatId);
    pendingWithdrawals.delete(chatId);
  };

  // Global error handlers with diagnostic tracking + auto-recovery
  let consecutiveErrors = 0;
  bot.on('polling_error', (err: any) => {
    const diag = botDiagnostics.get(botConfig.id);
    if (diag) {
      diag.pollingErrorCount++;
      diag.lastPollingError = `${err.code}: ${err.message}`;
      diag.lastPollingErrorAt = Date.now();
    }
    consecutiveErrors++;
    // Only log non-409 errors at error level (409 is common during restarts)
    if (err.message?.includes('409')) {
      console.warn(`[${botLabel}] Polling conflict (409) - another instance may be running`);
    } else {
      console.error(`[${botLabel}] Polling error: ${err.code} ${err.message}`);
    }
    // Auto-recovery: after 5 consecutive errors, schedule a restart
    if (consecutiveErrors >= 5 && !err.message?.includes('409')) {
      console.warn(`[${botLabel}] ${consecutiveErrors} consecutive errors, scheduling auto-restart...`);
      if (diag) diag.isPolling = false;
      scheduleRestart(botConfig.id);
      consecutiveErrors = 0; // Reset counter to avoid multiple restarts
    }
  });

  bot.on('error', (err: any) => {
    console.error(`[${botLabel}] General error: ${err.code} ${err.message}`);
  });

  // Log ALL incoming messages for debugging + update diagnostics
  bot.on('message', (msg: any) => {
    consecutiveErrors = 0; // Reset error counter on successful message
    const diag = botDiagnostics.get(botConfig.id);
    if (diag) {
      diag.lastMessageAt = Date.now();
      diag.messageCount++;
    }
    console.log(`[${botLabel}] 📩 Message from ${msg.from?.id} (@${msg.from?.username || 'N/A'}): ${msg.text || msg.contact ? '[contact]' : '[non-text]'}`);
  });

  // /start command
  bot.onText(/\/start(.*)/, async (msg, match) => {
    console.log(`[${botLabel}] ▶️ /start command from chat ${msg.chat.id} (user: ${msg.from?.id})`);
    // Track last /start handled time
    const diag = botDiagnostics.get(botConfig.id);
    if (diag) diag.lastStartHandledAt = Date.now();
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString() || "";
    const inviteParam = match?.[1]?.trim();
    const now = Date.now();
    const eventMessageId = msg.message_id || 0;

    // Deduplicate /start to avoid duplicate main menu messages.
    // This guards repeated delivery of the same update or rapid duplicate triggers.
    const lastStart = recentStartEvents.get(chatId);
    if (
      lastStart &&
      (lastStart.messageId === eventMessageId || now - lastStart.at < START_DEDUPE_WINDOW_MS)
    ) {
      console.log(
        `[${botLabel}] ⏭️ Skip duplicate /start in chat ${chatId} (msgId=${eventMessageId})`
      );
      return;
    }
    recentStartEvents.set(chatId, { messageId: eventMessageId, at: now });
    if (recentStartEvents.size > 5000) {
      // Lightweight cleanup to keep memory bounded.
      recentStartEvents.forEach((rec, cid) => {
        if (now - rec.at > 10 * 60 * 1000) recentStartEvents.delete(cid);
      });
    }

    trackMessage(chatId, msg.message_id);

    // Clean up old messages on every /start
    await cleanupMessages(bot, chatId, 0);
    // Clear any pending states
    clearChatPendingState(chatId);

    try {
      // Check if player already registered
      const existingPlayer = await findPlayerByTelegramId(adminId, telegramId);

      if (existingPlayer) {
        console.log(`[${botLabel}] Player found: ${existingPlayer.id}, showing main menu`);
        await showMainMenu(bot, chatId, existingPlayer, botConfig);
        return;
      }

      // Show welcome message with register button
      console.log(`[${botLabel}] New user, showing welcome message`);
      const welcomeText = `🎮 <b>Welcome to ${botConfig.botName || "TgGaming"}!</b>\n\n` +
        `Your premium gaming platform.\n\n` +
        `📱 Register now to start playing!\n` +
        `🎁 Check out our amazing bonuses!\n\n` +
        `${inviteParam ? `📨 Invite code: <code>${inviteParam}</code>` : ""}`;

      await sendAndTrack(bot, chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📝 Register", callback_data: `register:${inviteParam || ""}` },
            ],
            [
              { text: "🎁 Bonus Info", callback_data: "bonus_info" },
            ],
          ],
        },
      });
    } catch (err: any) {
      console.error(`[${botLabel}] Error handling /start: ${err.message}`, err.stack);
      try {
        await sendAndTrack(bot, chatId, "❌ An error occurred. Please try again later.");
      } catch {}
    }
  });

  // Contact handler for phone number registration
  bot.on("contact", async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString() || "";
    const phone = msg.contact?.phone_number || "";

    console.log(`[${botLabel}] 📱 Contact received from ${telegramId}: ${phone}`);
    trackMessage(chatId, msg.message_id);

    try {
      // Validate phone country restriction
      const allowedCountries = await getAllowedCountries(adminId);
      if (allowedCountries.length > 0) {
        const isAllowed = allowedCountries.some((prefix: string) =>
          phone.startsWith(prefix) || phone.startsWith("+" + prefix)
        );
        if (!isAllowed) {
          await sendAndTrack(
            bot,
            chatId,
            `❌ Sorry, your phone number country is not supported.\n\nAllowed: ${allowedCountries.join(", ")}`,
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          return;
        }
      }

      // Check if already registered
      const existing = await findPlayerByTelegramId(adminId, telegramId);
      if (existing) {
        await sendAndTrack(bot, chatId, "✅ You are already registered!", {
          reply_markup: { remove_keyboard: true },
        });
        await showMainMenu(bot, chatId, existing, botConfig);
        return;
      }

      // Get pending invite code from session
      const pendingInvite = pendingRegistrations.get(chatId);

      // Store pending registration data and show bank selection
      pendingBankSelection.set(chatId, {
        playerId: 0, // will be set after registration
        phone,
        firstName: msg.from?.first_name || "",
        lastName: msg.from?.last_name || "",
        username: msg.from?.username || "",
        inviteCode: pendingInvite || undefined,
      });
      pendingRegistrations.delete(chatId);

      // Fetch bank catalog for Malaysia
      const bankList = await db.getBankCatalog("MY");
      if (bankList.length > 0) {
        const bankButtons: any[] = [];
        for (const bank of bankList) {
          bankButtons.push([{ text: `🏦 ${bank.bankName}`, callback_data: `reg_bank:${bank.bankCode}:${bank.bankName}` }]);
        }
        bankButtons.push([{ text: "⏭️ Skip (set later)", callback_data: "reg_bank:skip:" }]);

        await sendAndTrack(bot, chatId, "📱 Phone verified! \n\n🏦 <b>Select your bank (optional):</b>\n\nYou can skip now and set bank details later in Settings.", {
          reply_markup: { remove_keyboard: true },
        });
        await sendAndTrack(bot, chatId, "🏦 <b>Select Bank</b>", {
          reply_markup: { inline_keyboard: bankButtons },
        });
      } else {
        // No bank catalog, register directly
        const player = await registerPlayerFromTelegram(
          adminId,
          telegramId,
          phone,
          msg.from?.first_name || "",
          msg.from?.last_name || "",
          msg.from?.username || "",
          pendingInvite || undefined
        );

        const displayWelcome =
          [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim() ||
          msg.from?.first_name ||
          "Player";
        await sendAndTrack(
          bot,
          chatId,
          `✅ <b>Registration Successful!</b>\n\n` +
            `Welcome, ${displayWelcome}!\n` +
            `Your username: <code>${player.username}</code>\n` +
            `Your invite code: <code>${player.inviteCode}</code>\n\n` +
            `Share your invite code with friends!`,
          { reply_markup: { remove_keyboard: true } }
        );

        await showMainMenu(bot, chatId, player, botConfig);
      }
    } catch (err: any) {
      console.error(`[${botLabel}] Error handling contact: ${err.message}`);
      await sendAndTrack(bot, chatId, `❌ Registration failed: ${err.message}`, {
        reply_markup: { remove_keyboard: true },
      });
    }
  });

  // Callback query handler
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    const telegramId = query.from.id.toString();
    const data = query.data || "";
    const now = Date.now();

    const lastCallback = recentCallbackEvents.get(chatId);
    if (
      lastCallback &&
      (lastCallback.queryId === query.id || (lastCallback.data === data && now - lastCallback.at < CALLBACK_DEDUPE_WINDOW_MS))
    ) {
      console.log(
        `[${botLabel}] ⏭️ Skip duplicate callback in chat ${chatId} (id=${query.id}, data=${data})`
      );
      return;
    }
    recentCallbackEvents.set(chatId, { queryId: query.id, data, at: now });
    if (recentCallbackEvents.size > 5000) {
      recentCallbackEvents.forEach((rec, cid) => {
        if (now - rec.at > 10 * 60 * 1000) recentCallbackEvents.delete(cid);
      });
    }

    console.log(`[${botLabel}] 🔘 Callback: "${data}" from ${telegramId}`);

    try {
      await bot.answerCallbackQuery(query.id);
    } catch {}

    try {
      // ─── Register ───
      if (data.startsWith("register:")) {
        const inviteCode = data.split(":")[1];
        if (inviteCode) pendingRegistrations.set(chatId, inviteCode);

        await sendAndTrack(bot, chatId, "📱 Please share your phone number to register:", {
          reply_markup: {
            keyboard: [
              [{ text: "📱 Share Phone Number", request_contact: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }

      // ─── Bank Selection during Registration ───
      if (data.startsWith("reg_bank:")) {
        const parts = data.split(":");
        const bankCode = parts[1];
        const bankName = parts[2] || "";
        const pending = pendingBankSelection.get(chatId);

        if (!pending) {
          await sendAndTrack(bot, chatId, "❌ Registration session expired. Please /start again.");
          return;
        }

        const selectedBank = bankCode === "skip" ? null : bankName;
        pendingBankSelection.set(chatId, {
          ...pending,
          selectedBankName: selectedBank,
          selectedBankCode: bankCode === "skip" ? null : bankCode,
        });

        await sendAndTrack(
          bot,
          chatId,
          `🧾 <b>Confirm Registration</b>\n\n` +
            `Phone: <code>${pending.phone}</code>\n` +
            `Bank: ${selectedBank || "Skip for now"}\n\n` +
            `You can confirm now or re-select your bank.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Confirm Registration", callback_data: "reg_confirm" }],
                [{ text: "🏦 Re-select Bank", callback_data: "reg_reselect_bank" }],
                [{ text: "❌ Cancel", callback_data: "main_menu" }],
              ],
            },
          }
        );
        return;
      }

      if (data === "reg_reselect_bank") {
        const pending = pendingBankSelection.get(chatId);
        if (!pending) {
          await sendAndTrack(bot, chatId, "❌ Registration session expired. Please /start again.");
          return;
        }
        const bankList = await db.getBankCatalog("MY");
        if (bankList.length === 0) {
          await sendAndTrack(bot, chatId, "⚠️ Bank list unavailable, you can continue with skip.", {
            reply_markup: {
              inline_keyboard: [[{ text: "✅ Confirm Registration", callback_data: "reg_confirm" }]],
            },
          });
          return;
        }
        const bankButtons: any[] = bankList.map((bank) => [
          { text: `🏦 ${bank.bankName}`, callback_data: `reg_bank:${bank.bankCode}:${bank.bankName}` },
        ]);
        bankButtons.push([{ text: "⏭️ Skip (set later)", callback_data: "reg_bank:skip:" }]);
        await sendAndTrack(bot, chatId, "🏦 <b>Select Bank</b>", {
          reply_markup: { inline_keyboard: bankButtons },
        });
        return;
      }

      if (data === "reg_confirm") {
        const pending = pendingBankSelection.get(chatId);
        if (!pending) {
          await sendAndTrack(bot, chatId, "❌ Registration session expired. Please /start again.");
          return;
        }

        const player = await registerPlayerFromTelegram(
          adminId,
          telegramId,
          pending.phone,
          pending.firstName,
          pending.lastName,
          pending.username,
          pending.inviteCode
        );

        if (pending.selectedBankName) {
          const database = await getDb();
          if (database) {
            await database
              .update(players)
              .set({ bankName: pending.selectedBankName })
              .where(eq(players.id, player.id));
          }
        }

        pendingBankSelection.delete(chatId);

        const welcomeName =
          [pending.firstName, pending.lastName].filter(Boolean).join(" ").trim() ||
          pending.firstName ||
          "Player";
        await sendAndTrack(
          bot,
          chatId,
          `✅ <b>Registration Successful!</b>\n\n` +
            `Welcome, ${welcomeName}!\n` +
            `Your username: <code>${player.username}</code>\n` +
            (pending.selectedBankName ? `Bank: ${pending.selectedBankName}\n` : "") +
            `Your invite code: <code>${player.inviteCode}</code>\n\n` +
            `Share your invite code with friends!`
        );

        await showMainMenu(bot, chatId, player, botConfig);
        return;
      }

      // ─── Bonus Info (pre-registration) ───
      if (data === "bonus_info") {
        const bonuses = await db.getActiveBonusesByAdmin(adminId);
        if (bonuses.length === 0) {
          await sendAndTrack(bot, chatId, "🎁 No bonuses available at the moment.");
          return;
        }
        let text = "🎁 <b>Available Bonuses:</b>\n\n";
        for (const b of bonuses.slice(0, 5)) {
          text += `• <b>${b.name}</b>\n`;
          if (b.bonusType === 0) text += `  Fixed: $${parseFloat(b.fixedAmount || "0").toFixed(2)}\n`;
          if (b.bonusType === 1) text += `  ${parseFloat(b.percentage || "0")}% of deposit\n`;
          if (b.bonusType === 2) text += `  Random: $${parseFloat(b.randomMin || "0").toFixed(2)} - $${parseFloat(b.randomMax || "0").toFixed(2)}\n`;
          if (b.rolloverMultiplier) text += `  Rollover: x${b.rolloverMultiplier}\n`;
          text += "\n";
        }
        text += "Register now to claim these bonuses!";
        await sendAndTrack(bot, chatId, text, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📝 Register Now", callback_data: "register:" }],
            ],
          },
        });
        return;
      }

      // ─── Authenticated actions ───
      const player = await findPlayerByTelegramId(adminId, telegramId);
      if (!player) {
        await sendAndTrack(bot, chatId, "❌ Please register first using /start");
        return;
      }

      // Main menu
      if (data === "main_menu") {
        await cleanupMessages(bot, chatId, 0);
        clearChatPendingState(chatId);
        await showMainMenu(bot, chatId, player, botConfig);
        return;
      }

      // ─── Deposit ───
      if (data === "deposit") {
        await cleanupMessages(bot, chatId, 0);
        const check = await canCreateDeposit(player.id);
        if (!check.allowed) {
          await sendAndTrack(bot, chatId, `❌ Cannot deposit: ${check.reason}\n\nPlease complete your current cycle first.`, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }
        const banks = await db.getDepositBanks(adminId);
        if (banks.length === 0) {
          await sendAndTrack(bot, chatId, "❌ No deposit banks configured. Please contact support.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }
        let text = "💰 <b>Deposit</b>\n\nTransfer to one of these accounts:\n\n";
        const bankButtons: any[] = [];
        for (const bank of banks) {
          text += `🏦 <b>${bank.bankName}</b>\n`;
          text += `   Account: <code>${bank.accountNumber}</code>\n`;
          text += `   Name: ${bank.accountName}\n\n`;
          bankButtons.push([{ text: `💳 ${bank.bankName}`, callback_data: `deposit_bank:${bank.id}` }]);
        }
        text += "After transferring, select the bank you used:";
        bankButtons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);
        await sendAndTrack(bot, chatId, text, { reply_markup: { inline_keyboard: bankButtons } });
        return;
      }

      if (data.startsWith("deposit_bank:")) {
        const bankId = parseInt(data.split(":")[1]);
        pendingDeposits.set(chatId, { bankId, playerId: player.id, adminId, awaitingReceipt: false });
        await sendAndTrack(bot, chatId, "💰 Please enter the deposit amount:", {
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] },
        });
        return;
      }

      // ─── Withdraw ───
      if (data === "withdraw") {
        await cleanupMessages(bot, chatId, 0);
        const check = await checkWithdrawalConditions(player.id);
        if (!check.canWithdraw) {
          let text = `❌ Cannot withdraw yet.\n\n`;
          if (check.reason) text += `Reason: ${check.reason}\n`;
          if (check.rolloverProgress) text += `Rollover: ${check.rolloverProgress.percentage.toFixed(1)}%\n`;
          if (check.turnoverProgress) text += `Turnover: ${check.turnoverProgress.percentage.toFixed(1)}%\n`;
          await sendAndTrack(bot, chatId, text, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }
        pendingWithdrawals.set(chatId, { playerId: player.id, adminId });
        await sendAndTrack(bot, chatId, `💸 <b>Withdraw</b>\n\nPlease enter the withdrawal amount:`, {
          reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] },
        });
        return;
      }

      // ─── Games ───
      if (data === "games") {
        await cleanupMessages(bot, chatId, 0);
        const autoLoginToken = generateAutoLoginToken(player.id, player.adminId || adminId);
        const webLink = await resolvePlayerAutoLoginUrl(adminId, botConfig, autoLoginToken);

        const frontend = await db.getFrontendSettings(adminId);
        let customTitle = "🎮 <b>Game Center</b>";
        let customDesc = "Choose how you want to play games:";
        let continueText = "🚀 Continue & Login";
        const raw = (frontend as any)?.layoutInjections?.game?.dataJson;
        if (typeof raw === "string" && raw.trim()) {
          try {
            const cfg = JSON.parse(raw);
            customTitle = String(cfg.title || customTitle);
            customDesc = String(cfg.description || customDesc);
            continueText = String(cfg.continueText || continueText);
          } catch {}
        } else if (raw && typeof raw === "object") {
          const cfg: any = raw;
          customTitle = String(cfg.title || customTitle);
          customDesc = String(cfg.description || customDesc);
          continueText = String(cfg.continueText || continueText);
        }

        const keyboard: any[][] = [];
        // Continue means direct frontend auto-login.
        if (webLink) {
          keyboard.push([{ text: continueText, url: webLink }]);
        } else {
          keyboard.push([{ text: continueText, callback_data: "games_open_frontend" }]);
        }
        keyboard.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);
        await sendAndTrack(bot, chatId, `${customTitle}\n\n${customDesc}`, {
          reply_markup: { inline_keyboard: keyboard },
        });
        return;
      }

      if (data === "games_open_frontend" || data === "games_providers") {
        // Backward compatibility:
        // old button "games_providers" should no longer open provider list,
        // it should direct user to frontend auto-login flow.
        const autoLoginToken = generateAutoLoginToken(player.id, player.adminId || adminId);
        const webLink = await resolvePlayerAutoLoginUrl(adminId, botConfig, autoLoginToken);
        if (!webLink) {
          await sendAndTrack(bot, chatId, "❌ Frontend URL is not configured. Please contact support.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }
        await sendAndTrack(bot, chatId, "🎮 <b>Game Center</b>\n\nChoose how you want to play games:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 Continue & Login", url: webLink }],
              [{ text: "⬅️ Back", callback_data: "main_menu" }],
            ],
          },
        });
        return;
      }

      if (data === "games_providers_legacy") {
        const config = await getMiddlewaveConfig(adminId);
        if (!config) {
          await sendAndTrack(bot, chatId, "❌ Games not configured. Contact support.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }

        // Use dynamic provider discovery from ProjectInfo API
        try {
          const activeProviders = await getActiveProviders(config);
          if (activeProviders.length === 0) {
            await sendAndTrack(bot, chatId, "🎮 No game providers available at the moment.", {
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
            });
            return;
          }

          // Show providers as buttons
          const buttons: any[] = [];
          for (const provider of activeProviders) {
            buttons.push([{ text: `🎮 ${provider}`, callback_data: `game_provider:${provider}` }]);
          }
          buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);

          await sendAndTrack(bot, chatId, "🎮 <b>Game Providers</b>\n\nSelect a provider to view games:", {
            reply_markup: { inline_keyboard: buttons },
          });
        } catch (err: any) {
          console.error(`[TG Bot] Error fetching providers: ${err.message}`);
          await sendAndTrack(bot, chatId, "❌ Failed to load games. Please try again later.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
        }
        return;
      }

      // Provider-based game listing (from ProjectInfo)
      if (data.startsWith("game_provider:")) {
        const provider = data.split(":")[1];
        const config = await getMiddlewaveConfig(adminId);
        if (!config) return;
        const result = await getGameList(config, provider);
        const games = result.games || [];

        if (games.length === 0) {
          await sendAndTrack(bot, chatId, `🎮 No games available for ${provider}.`, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Providers", callback_data: "games" }]] },
          });
          return;
        }

        // Group by game type within provider
        const grouped: Record<string, any[]> = {};
        for (const g of games) {
          const type = (g as any).gameType || (g as any).GameType || "Other";
          if (!grouped[type]) grouped[type] = [];
          grouped[type].push(g);
        }

        const buttons: any[] = [];
        for (const [type, typeGames] of Object.entries(grouped)) {
          buttons.push([{ text: `🎮 ${type} (${typeGames.length})`, callback_data: `game_type:${provider}:${type}` }]);
        }
        buttons.push([{ text: "⬅️ Back to Providers", callback_data: "games" }]);

        await sendAndTrack(bot, chatId, `🎮 <b>${provider} Games</b>\n\nSelect a category:`, {
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      // Game type within a provider
      if (data.startsWith("game_type:")) {
        const parts = data.split(":");
        const provider = parts[1];
        const type = parts[2];
        const config = await getMiddlewaveConfig(adminId);
        if (!config) return;
        const result = await getGameList(config, provider);
        const games = (result.games || []).filter((g: any) => (g.gameType || g.GameType) === type);

        const buttons: any[] = [];
        for (const g of games.slice(0, 20)) {
          buttons.push([{ text: (g as any).gameName, callback_data: `play:${provider}:${(g as any).gameCode}` }]);
        }
        if (games.length > 20) {
          buttons.push([{ text: `... and ${games.length - 20} more`, callback_data: `game_provider:${provider}` }]);
        }
        buttons.push([{ text: "⬅️ Back to Categories", callback_data: `game_provider:${provider}` }]);

        await sendAndTrack(bot, chatId, `🎮 <b>${provider} - ${type}</b>`, {
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      if (data.startsWith("play:")) {
        const parts = data.split(":");
        const provider = parts[1];
        const gameCode = parts[2];

        if (!player.middlewavePlayerId) {
          await sendAndTrack(bot, chatId, "❌ Your game account is not set up. Contact support.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "games" }]] },
          });
          return;
        }

        const config = await getMiddlewaveConfig(adminId);
        if (!config) return;

        const result = await loginGame(config, provider, player.middlewavePlayerId, gameCode);
        if (result.success && result.url) {
          await sendAndTrack(bot, chatId, `🎮 <b>Game Ready!</b>\n\nTap the button below to play:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎮 Play Now", url: result.url }],
                [{ text: "⬅️ Back", callback_data: "games" }],
              ],
            },
          });
        } else {
          await sendAndTrack(bot, chatId, `❌ Failed to launch game: ${result.error || "Unknown error"}`, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "games" }]] },
          });
        }
        return;
      }

      // ─── Bonus ───
      if (data === "bonus") {
        await cleanupMessages(bot, chatId, 0);
        const bonuses = await db.getActiveBonusesByAdmin(adminId);
        if (bonuses.length === 0) {
          await sendAndTrack(bot, chatId, "🎁 No bonuses available.", {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
          });
          return;
        }

        const buttons: any[] = [];
        for (const b of bonuses.slice(0, 10)) {
          let label = `🎁 ${b.name}`;
          if (b.bonusType === 0) label += ` ($${parseFloat(b.fixedAmount || "0").toFixed(0)})`;
          if (b.bonusType === 1) label += ` (${parseFloat(b.percentage || "0")}%)`;
          buttons.push([{ text: label, callback_data: `claim_bonus:${b.id}` }]);
        }
        buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);

        await sendAndTrack(bot, chatId, "🎁 <b>Available Bonuses</b>\n\nSelect a bonus to claim:", {
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      if (data.startsWith("claim_bonus:")) {
        const bonusId = parseInt(data.split(":")[1]);
        const cycle = await db.getActiveCycle(player.id);
        const depositAmount = cycle ? parseFloat(cycle.depositAmount) : 0;
        const idempotencyKey = `tg:${query.id}:${player.id}:${bonusId}`;

        const result = await claimBonus(player.id, adminId, bonusId, depositAmount, {
          idempotencyKey,
          requestSource: "telegram_bot",
          sourceEvent: "telegram_claim",
          sourceRef: query.id,
          requestMeta: {
            callbackData: data,
            chatId,
          },
        });
        if (result.success) {
          await sendAndTrack(bot, chatId, `✅ <b>Bonus Claimed!</b>\n\nAmount: $${(result.awardedAmount || 0).toFixed(2)}`, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "bonus" }]] },
          });
        } else {
          await sendAndTrack(bot, chatId, `❌ ${result.error}`, {
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "bonus" }]] },
          });
        }
        return;
      }

      // ─── Settings ───
      if (data === "settings") {
        await cleanupMessages(bot, chatId, 0);
        await sendAndTrack(bot, chatId, `⚙️ <b>Settings</b>\n\n` +
          `👤 Username: <code>${player.username}</code>\n` +
          `📱 Phone: ${player.phone}\n` +
          `🏦 Bank: ${player.bankName || "Not set"}\n` +
          `📨 Invite Code: <code>${player.inviteCode}</code>`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📨 Share Invite Code", callback_data: "share_invite" }],
              [{ text: "⬅️ Back", callback_data: "main_menu" }],
            ],
          },
        });
        return;
      }

      if (data === "share_invite") {
        const shareText = `🎮 Join me on ${botConfig.botName || "TgGaming"}!\n\nUse my invite code: ${player.inviteCode}\n\nhttps://t.me/${botConfig.botUsername}?start=${player.inviteCode}`;
        await sendAndTrack(bot, chatId, shareText, {
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "settings" }]] },
        });
        return;
      }

      // ─── Balance ───
      if (data === "balance") {
        await cleanupMessages(bot, chatId, 0);
        await sendAndTrack(bot, chatId, `💰 <b>Your Balance</b>\n\nMain: $${parseFloat(player.balance || "0").toFixed(2)}`, {
          reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
        });
        return;
      }
    } catch (err: any) {
      console.error(`[${botLabel}] Error handling callback "${data}": ${err.message}`, err.stack);
      try {
        await sendAndTrack(bot, chatId, "❌ An error occurred. Please try again.");
      } catch {}
    }
  });

  // Text message handler (for deposit/withdrawal amounts)
  bot.on("message", async (msg) => {
    if (msg.contact || msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || "";
    const telegramId = msg.from?.id?.toString() || "";

    trackMessage(chatId, msg.message_id);

    try {
      // Handle pending deposit amount + receipt upload
      if (pendingDeposits.has(chatId)) {
        const pending = pendingDeposits.get(chatId)!;
        if (!pending.awaitingReceipt) {
          const amount = parseFloat(text);
          if (isNaN(amount) || amount <= 0) {
            await sendAndTrack(bot, chatId, "❌ Please enter a valid amount.");
            return;
          }
          pending.amount = amount;
          pending.awaitingReceipt = true;
          pendingDeposits.set(chatId, pending);
          await sendAndTrack(
            bot,
            chatId,
            `🧾 Amount received: <b>$${amount.toFixed(2)}</b>\n\nNow please upload your transfer receipt image (photo) to complete deposit submission.`,
            {
              reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "main_menu" }]] },
            }
          );
          return;
        }

        if (!msg.photo || msg.photo.length === 0) {
          await sendAndTrack(bot, chatId, "❌ Receipt image is required. Please upload a photo screenshot of your transfer.");
          return;
        }

        const amount = pending.amount || 0;
        const bestPhoto = msg.photo[msg.photo.length - 1];
        let receiptUrl: string | undefined;
        try {
          receiptUrl = await bot.getFileLink(bestPhoto.file_id);
        } catch (err: any) {
          console.warn(`[${botLabel}] Failed to get receipt file link: ${err?.message || err}`);
        }

        try {
          const result = await createDeposit({
            playerId: pending.playerId,
            adminId: pending.adminId,
            amount,
            paymentMethod: "bank_transfer",
            bankId: pending.bankId,
            receiptUrl,
          });
          if (result.success) {
            notifyAdminNewDeposit(pending.adminId, {
              depositId: result.depositId,
              playerId: pending.playerId,
              amount,
              status: "pending",
            });
            await sendAndTrack(bot, chatId, `✅ <b>Deposit Submitted!</b>\n\nAmount: $${amount.toFixed(2)}\nStatus: Pending\n\nPlease wait for admin approval.`, {
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Main Menu", callback_data: "main_menu" }]] },
            });
          } else {
            await sendAndTrack(bot, chatId, `❌ ${result.error}`, {
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
            });
          }
        } catch (err: any) {
          await sendAndTrack(bot, chatId, `❌ Error: ${err.message}`);
        }
        pendingDeposits.delete(chatId);
        return;
      }

      // Handle pending withdrawal amount
      if (pendingWithdrawals.has(chatId)) {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          await sendAndTrack(bot, chatId, "❌ Please enter a valid amount.");
          return;
        }
        const pending = pendingWithdrawals.get(chatId)!;
        try {
          const result = await createWithdrawal({
            playerId: pending.playerId,
            adminId: pending.adminId,
            amount,
          });
          if (result.success) {
            notifyAdminNewWithdrawal(pending.adminId, {
              withdrawalId: result.withdrawalId,
              playerId: pending.playerId,
              amount,
              status: "pending",
            });
            await sendAndTrack(bot, chatId, `✅ <b>Withdrawal Submitted!</b>\n\nAmount: $${amount.toFixed(2)}\nStatus: Pending`, {
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Main Menu", callback_data: "main_menu" }]] },
            });
          } else {
            await sendAndTrack(bot, chatId, `❌ ${result.error}`, {
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "main_menu" }]] },
            });
          }
        } catch (err: any) {
          await sendAndTrack(bot, chatId, `❌ Error: ${err.message}`);
        }
        pendingWithdrawals.delete(chatId);
        return;
      }
    } catch (err: any) {
      console.error(`[${botLabel}] Error handling text message: ${err.message}`);
    }
  });
}

// ─── Main Menu ───

async function showMainMenu(
  bot: TelegramBot,
  chatId: number,
  player: any,
  botConfig: any
) {
  const balance = parseFloat(player.balance || "0").toFixed(2);

  // Generate auto-login token for web access
  const autoLoginToken = generateAutoLoginToken(player.id, player.adminId || botConfig.adminId);
  const webLink = await resolvePlayerAutoLoginUrl(player.adminId || botConfig.adminId, botConfig, autoLoginToken);

  const text =
    `🎮 <b>${botConfig.botName || "TgGaming"}</b>\n\n` +
    `👤 ${player.displayName || player.telegramFirstName || "Player"}\n` +
    `💰 Balance: $${balance}\n`;

  const keyboard: any[][] = [
    [
      { text: "💰 Deposit", callback_data: "deposit" },
      { text: "💸 Withdraw", callback_data: "withdraw" },
    ],
    [
      { text: "🎮 Games", callback_data: "games" },
      { text: "🎁 Bonus", callback_data: "bonus" },
    ],
    [
      { text: "💵 Balance", callback_data: "balance" },
      { text: "⚙️ Settings", callback_data: "settings" },
    ],
  ];

  await sendAndTrack(bot, chatId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// ─── Pending state maps ───

const pendingRegistrations = new Map<number, string>(); // chatId -> inviteCode
const pendingBankSelection = new Map<
  number,
  {
    playerId: number;
    phone: string;
    firstName: string;
    lastName: string;
    username: string;
    inviteCode?: string;
    selectedBankName?: string | null;
    selectedBankCode?: string | null;
  }
>(); // chatId -> pending registration data waiting for bank selection
const pendingDeposits = new Map<
  number,
  { bankId: number; playerId: number; adminId: number; amount?: number; awaitingReceipt?: boolean }
>();
const pendingWithdrawals = new Map<
  number,
  { playerId: number; adminId: number; maxAmount?: string }
>();

// ─── Database helpers ───

async function findPlayerByTelegramId(
  adminId: number,
  telegramId: string
): Promise<any | null> {
  const database = await getDb();
  if (!database) return null;

  const result = await database
    .select()
    .from(players)
    .where(
      and(eq(players.adminId, adminId), eq(players.telegramId, telegramId))
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

async function getAllowedCountries(adminId: number): Promise<string[]> {
  const database = await getDb();
  if (!database) return [];

  const result = await database
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.adminId, adminId),
        eq(systemSettings.settingKey, "allowed_phone_prefixes")
      )
    )
    .limit(1);

  if (result.length > 0 && result[0].settingValue) {
    try {
      return JSON.parse(result[0].settingValue);
    } catch {
      return result[0].settingValue.split(",").map((s: string) => s.trim());
    }
  }
  return [];
}

async function registerPlayerFromTelegram(
  adminId: number,
  telegramId: string,
  phone: string,
  firstName: string,
  lastName: string,
  tgUsername: string,
  inviteCode?: string
): Promise<any> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Generate username
  const username = tgUsername || `tg_${telegramId.slice(-6)}`;
  const invCode = nanoid(8).toUpperCase();
  const passwordHash = await hashPassword(nanoid(12)); // Random password for TG users
  const middlewavePlayerId = generateMiddlewavePlayerId(adminId, username || telegramId);

  // Check invite code
  let referrerId: number | null = null;
  if (inviteCode) {
    const referrer = await database
      .select()
      .from(players)
      .where(and(eq(players.adminId, adminId), eq(players.inviteCode, inviteCode)))
      .limit(1);
    if (referrer.length > 0) referrerId = referrer[0].id;
  }

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || firstName || "";

  const [result] = await database.insert(players).values({
    adminId,
    telegramId,
    telegramUsername: tgUsername || null,
    telegramFirstName: firstName || null,
    telegramLastName: lastName?.trim() ? lastName.trim() : null,
    phone: phone || null,
    inviteCode: invCode,
    invitedBy: referrerId,
    isActive: true,
    lang: "en",
    middlewavePlayerId,
  }).$returningId();

  // If there's a referrer, create invite relation
  if (referrerId) {
    try {
      const { inviteRelations } = await import("../../drizzle/schema");
      await database.insert(inviteRelations).values({
        inviterId: referrerId,
        inviteeId: result.id,
      });
    } catch {}
  }

  return {
    id: result.id,
    adminId,
    username,
    phone,
    displayName,
    telegramId,
    inviteCode: invCode,
    balance: "0",
  };
}

// ─── Notification Bridge ───

export async function notifyPlayerViaTelegram(
  adminId: number,
  playerId: number,
  message: string
) {
  const database = await getDb();
  if (!database) return;

  // Find the player's telegram ID
  const [player] = await database
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.adminId, adminId)))
    .limit(1);

  if (!player?.telegramId) return;

  // Find the bot for this admin
  const [botConfig] = await database
    .select()
    .from(telegramBots)
    .where(and(eq(telegramBots.adminId, adminId), eq(telegramBots.isActive, true)))
    .limit(1);

  if (!botConfig) return;

  const bot = activeBots.get(botConfig.id);
  if (!bot) return;

  try {
    await bot.sendMessage(parseInt(player.telegramId), message, {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error(`[TG Bot] Failed to notify player ${playerId}:`, err);
  }
}

// Export for use in deposit/withdrawal approval flows
export { activeBots };

// ─── Webhook Handler ───
// For production: process Telegram updates received via webhook instead of polling
export async function handleWebhookUpdate(botId: number, update: any): Promise<void> {
  const bot = activeBots.get(botId);
  if (!bot) {
    console.warn(`[TG Webhook] No active bot for id ${botId}`);
    return;
  }
  // node-telegram-bot-api can process webhook updates via processUpdate
  try {
    bot.processUpdate(update);
  } catch (err) {
    console.error(`[TG Webhook] Error processing update for bot ${botId}:`, err);
  }
}

// ─── Switch Bot to Webhook Mode ───
export async function switchToWebhook(botId: number, webhookUrl: string): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;

  const [botConfig] = await database
    .select()
    .from(telegramBots)
    .where(eq(telegramBots.id, botId));

  if (!botConfig?.botToken) return false;

  // Stop polling if active
  await stopBot(botId);

  // Create bot in webhook mode (no polling)
  const bot = new TelegramBot(botConfig.botToken);
  const fullUrl = `${webhookUrl}/api/telegram/webhook/${botId}`;

  try {
    await bot.setWebHook(fullUrl);
    registerHandlers(bot, botConfig);
    activeBots.set(botId, bot);
    console.log(`[TG Bot] Bot ${botId} switched to webhook: ${fullUrl}`);
    return true;
  } catch (err) {
    console.error(`[TG Bot] Failed to set webhook for bot ${botId}:`, err);
    return false;
  }
}
