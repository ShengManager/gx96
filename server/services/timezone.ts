/**
 * Timezone utility module for TgGaming.
 * All DB storage is UTC. This module converts UTC timestamps to configured display timezone.
 */

/**
 * Convert a UTC date string (e.g. "2026-01-15") to the start-of-day in the given IANA timezone,
 * returned as a UTC Date object suitable for DB queries.
 *
 * Example: "2026-01-15" in "Asia/Kuala_Lumpur" (UTC+8) → 2026-01-14T16:00:00Z
 */
export function startOfDayInTimezone(dateStr: string, timezone: string): Date {
  // Parse the date string as local date in the target timezone
  // Create a date at midnight in the target timezone
  const parts = dateStr.split("-");
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);

  // Use Intl to find the UTC offset for this timezone at this date
  const offsetMs = getTimezoneOffsetMs(new Date(Date.UTC(year, month, day)), timezone);

  // Midnight in target timezone = midnight UTC - offset
  return new Date(Date.UTC(year, month, day) - offsetMs);
}

/**
 * Convert a UTC date string to end-of-day (23:59:59.999) in the given IANA timezone,
 * returned as a UTC Date object suitable for DB queries.
 */
export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
  const start = startOfDayInTimezone(dateStr, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Get the UTC offset in milliseconds for a given timezone at a specific date.
 * Positive means ahead of UTC (e.g., UTC+8 = +28800000).
 */
export function getTimezoneOffsetMs(date: Date, timezone: string): number {
  // Format the date in the target timezone and in UTC, then compute the difference
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone });

  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);

  return tzDate.getTime() - utcDate.getTime();
}

/**
 * Format a UTC Date to a display string in the given IANA timezone.
 */
export function formatInTimezone(date: Date | string | number, timezone: string, format: "datetime" | "date" | "time" = "datetime"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions = { timeZone: timezone };

  if (format === "datetime" || format === "date") {
    options.year = "numeric";
    options.month = "2-digit";
    options.day = "2-digit";
  }
  if (format === "datetime" || format === "time") {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.second = "2-digit";
    options.hour12 = false;
  }

  return new Intl.DateTimeFormat("en-GB", options).format(d);
}

/**
 * Format a UTC timestamp as ISO string in the given timezone.
 * Returns format like "2026-01-15T08:00:00+08:00"
 */
export function toTimezoneISO(date: Date | string | number, timezone: string): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const offsetMs = getTimezoneOffsetMs(d, timezone);
  const localDate = new Date(d.getTime() + offsetMs);

  const offsetHours = Math.floor(Math.abs(offsetMs) / 3600000);
  const offsetMinutes = Math.floor((Math.abs(offsetMs) % 3600000) / 60000);
  const sign = offsetMs >= 0 ? "+" : "-";
  const offsetStr = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  return localDate.toISOString().replace("Z", "").replace(/\.\d{3}$/, "") + offsetStr;
}
