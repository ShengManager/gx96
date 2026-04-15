import { describe, expect, it, vi, beforeEach } from "vitest";
import { getBotStatus, getAllBotStatuses } from "./services/telegramBot";

describe("telegramBot diagnostics", () => {
  it("getBotStatus returns null for non-existent bot", () => {
    const status = getBotStatus(99999);
    expect(status).toBeNull();
  });

  it("getAllBotStatuses returns an array", () => {
    const statuses = getAllBotStatuses();
    expect(Array.isArray(statuses)).toBe(true);
  });

  it("getAllBotStatuses returns objects with expected shape when bots exist", () => {
    const statuses = getAllBotStatuses();
    for (const s of statuses) {
      expect(s).toHaveProperty("botId");
      expect(s).toHaveProperty("botUsername");
      expect(s).toHaveProperty("startedAt");
      expect(s).toHaveProperty("lastMessageAt");
      expect(s).toHaveProperty("messageCount");
      expect(s).toHaveProperty("pollingErrorCount");
      expect(s).toHaveProperty("lastPollingError");
      expect(s).toHaveProperty("lastPollingErrorAt");
      expect(s).toHaveProperty("isPolling");
    }
  });
});

describe("telegramBot module exports", () => {
  it("exports startBot function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.startBot).toBe("function");
  });

  it("exports stopBot function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.stopBot).toBe("function");
  });

  it("exports restartBot function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.restartBot).toBe("function");
  });

  it("exports getBotStatus function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.getBotStatus).toBe("function");
  });

  it("exports getAllBotStatuses function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.getAllBotStatuses).toBe("function");
  });

  it("exports notifyPlayerViaTelegram function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.notifyPlayerViaTelegram).toBe("function");
  });

  it("exports handleWebhookUpdate function", async () => {
    const mod = await import("./services/telegramBot");
    expect(typeof mod.handleWebhookUpdate).toBe("function");
  });

  it("exports activeBots map", async () => {
    const mod = await import("./services/telegramBot");
    expect(mod.activeBots).toBeInstanceOf(Map);
  });
});
