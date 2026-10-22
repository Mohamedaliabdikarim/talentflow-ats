import { z } from "zod";

const uuid = z.uuid();

/**
 * Route ids that are not UUIDs can never match a row, so pages answer "not found" without a
 * database round trip instead of surfacing a type error from PostgreSQL as a server error.
 */
export function isUuid(value: string): boolean {
  return uuid.safeParse(value).success;
}
