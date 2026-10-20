import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { processInsight, runPendingInsights } from "@/server/insights/runner";

/**
 * Internal insights runner endpoint (ADR-036, docs/AI_INSIGHTS.md §5).
 *
 * Authenticated by a shared secret, not a user session: the Server Action that queued a row
 * kicks it immediately via after(), and a scheduler calls it periodically to drain anything that
 * is still pending (durability). It accepts no tenant data — only an optional insight id — and
 * processes rows that an authorized action already created. Without a configured secret, or with
 * a wrong one, it answers 404 and reveals nothing. Responses carry ids and outcomes only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ insightId: z.uuid().optional() });

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = getServerEnv().INSIGHTS_RUNNER_SECRET;
  const provided = request.headers.get("x-insights-secret") ?? "";
  if (!expected || !secretMatches(provided, expected)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let insightId: string | undefined;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    insightId = parsed.data.insightId;
  } catch {
    // No/empty body: drain mode (scheduler).
  }

  const outcomes = insightId
    ? [await processInsight(insightId)]
    : await runPendingInsights({ limit: 5 });

  return NextResponse.json(
    { processed: outcomes.map(({ insightId, outcome }) => ({ insightId, outcome })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
