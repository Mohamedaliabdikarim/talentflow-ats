import { z } from "zod";

/** HTML forms submit empty strings for untouched fields; treat those as "not provided". */
export function emptyToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/** Optional free-text field with a maximum length that mirrors the database check constraint. */
export function optionalText(max: number) {
  return z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
}

/** Parses an https URL; returns null for anything else (including javascript: and http:). */
export function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
