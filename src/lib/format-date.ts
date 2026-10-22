/**
 * The one formatter for timestamps shown in the UI. The time zone is explicit so a value renders
 * identically on the server (Vercel functions run in UTC) and in the browser, which avoids
 * hydration mismatches and shows every user the same wall-clock time. The product's first
 * customer works in Norway, so Europe/Oslo is the display zone (not the viewer's zone).
 */
export const APP_TIME_ZONE = "Europe/Oslo";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: APP_TIME_ZONE,
});

/** Formats an ISO timestamp (or epoch milliseconds) as "19 Oct 2026, 11:00" in Europe/Oslo. */
export function formatDateTime(value: string | number | Date): string {
  return dateTimeFormatter.format(new Date(value));
}
