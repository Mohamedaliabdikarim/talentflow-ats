import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, formatDateTime } from "@/lib/format-date";
import { formatDateTime as reExported } from "@/components/page-header";

/**
 * Every timestamp in the UI goes through one formatter with an explicit time zone, so the
 * server (UTC on the host) and the browser render the same text (no hydration mismatch) and
 * every viewer sees Europe/Oslo wall-clock time.
 */

describe("formatDateTime", () => {
  it("renders in Europe/Oslo regardless of the process time zone, across DST", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Oslo");
    // Winter: UTC+1.
    expect(formatDateTime("2026-01-15T12:00:00.000Z")).toMatch(/^15 Jan 2026,\s13:00$/);
    // Summer: UTC+2.
    expect(formatDateTime("2026-07-15T12:00:00.000Z")).toMatch(/^15 Jul 2026,\s14:00$/);
    // A UTC instant late in the evening is already the next day in Oslo.
    expect(formatDateTime("2026-10-19T22:30:00.000Z")).toMatch(/^20 Oct 2026,\s00:30$/);
  });

  it("accepts epoch milliseconds and Date objects and is the formatter the views import", () => {
    const instant = Date.parse("2026-10-19T09:00:00.000Z");
    expect(formatDateTime(instant)).toBe(formatDateTime(new Date(instant)));
    expect(formatDateTime(instant)).toMatch(/^19 Oct 2026,\s11:00$/);
    expect(reExported).toBe(formatDateTime);
  });
});
