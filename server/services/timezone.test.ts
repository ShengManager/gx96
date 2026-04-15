import { describe, expect, it } from "vitest";
import {
  startOfDayInTimezone,
  endOfDayInTimezone,
  formatInTimezone,
  toTimezoneISO,
  getTimezoneOffsetMs,
} from "./timezone";

describe("Timezone Utilities", () => {
  describe("startOfDayInTimezone", () => {
    it("should return midnight UTC for UTC timezone", () => {
      const result = startOfDayInTimezone("2026-01-15", "UTC");
      expect(result.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    });

    it("should return correct UTC time for Asia/Kuala_Lumpur (UTC+8)", () => {
      // Midnight in KL (UTC+8) = 2026-01-14T16:00:00Z
      const result = startOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");
      expect(result.toISOString()).toBe("2026-01-14T16:00:00.000Z");
    });

    it("should return correct UTC time for America/New_York (UTC-5 in Jan)", () => {
      // Midnight in NYC (UTC-5 in January) = 2026-01-15T05:00:00Z
      const result = startOfDayInTimezone("2026-01-15", "America/New_York");
      expect(result.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    });
  });

  describe("endOfDayInTimezone", () => {
    it("should return end of day for UTC timezone", () => {
      const result = endOfDayInTimezone("2026-01-15", "UTC");
      // Should be 23:59:59.999 UTC
      expect(result.getTime()).toBe(new Date("2026-01-15T23:59:59.999Z").getTime());
    });

    it("should return correct UTC end-of-day for Asia/Kuala_Lumpur", () => {
      const start = startOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");
      const end = endOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");
      // End should be exactly 24h - 1ms after start
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    });
  });

  describe("getTimezoneOffsetMs", () => {
    it("should return 0 for UTC", () => {
      const offset = getTimezoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "UTC");
      expect(offset).toBe(0);
    });

    it("should return +8h for Asia/Kuala_Lumpur", () => {
      const offset = getTimezoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "Asia/Kuala_Lumpur");
      expect(offset).toBe(8 * 60 * 60 * 1000);
    });
  });

  describe("formatInTimezone", () => {
    it("should format UTC date in KL timezone", () => {
      // 2026-01-15T00:00:00Z in KL = 2026-01-15 08:00:00
      const result = formatInTimezone("2026-01-15T00:00:00Z", "Asia/Kuala_Lumpur", "datetime");
      expect(result).toContain("15");
      expect(result).toContain("08");
    });

    it("should format date-only", () => {
      const result = formatInTimezone("2026-01-15T00:00:00Z", "UTC", "date");
      expect(result).toContain("15");
      expect(result).toContain("01");
      expect(result).toContain("2026");
    });
  });

  describe("toTimezoneISO", () => {
    it("should produce ISO string with timezone offset for KL", () => {
      const result = toTimezoneISO("2026-01-15T00:00:00Z", "Asia/Kuala_Lumpur");
      expect(result).toContain("+08:00");
      expect(result).toContain("2026-01-15T08:00:00");
    });

    it("should produce ISO string with +00:00 for UTC", () => {
      const result = toTimezoneISO("2026-01-15T12:00:00Z", "UTC");
      expect(result).toContain("+00:00");
      expect(result).toContain("12:00:00");
    });
  });

  describe("Timezone boundary tests for reports", () => {
    it("should correctly handle day boundary: event at 23:30 KL time should be in that KL day", () => {
      // 23:30 KL = 15:30 UTC
      const eventUtc = new Date("2026-01-15T15:30:00Z");
      const dayStart = startOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");
      const dayEnd = endOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");

      expect(eventUtc.getTime()).toBeGreaterThanOrEqual(dayStart.getTime());
      expect(eventUtc.getTime()).toBeLessThanOrEqual(dayEnd.getTime());
    });

    it("should correctly exclude event from previous KL day", () => {
      // 2026-01-14 15:59 UTC = 2026-01-14 23:59 KL (still Jan 14 in KL)
      const eventUtc = new Date("2026-01-14T15:59:00Z");
      const dayStart = startOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");

      expect(eventUtc.getTime()).toBeLessThan(dayStart.getTime());
    });

    it("should correctly include event at start of KL day", () => {
      // 2026-01-14 16:00 UTC = 2026-01-15 00:00 KL (start of Jan 15 in KL)
      const eventUtc = new Date("2026-01-14T16:00:00Z");
      const dayStart = startOfDayInTimezone("2026-01-15", "Asia/Kuala_Lumpur");

      expect(eventUtc.getTime()).toBeGreaterThanOrEqual(dayStart.getTime());
    });
  });
});
