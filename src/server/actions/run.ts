import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type ActionState, errorState } from "@/lib/action-state";
import { AuthorizationError } from "@/server/auth";

/**
 * Wraps a Server Action body: Next.js control-flow errors (redirect, notFound) are
 * re-thrown, authorization failures become a 403-style error state, and anything else
 * becomes a generic message. Internal error details never reach the client.
 */
export async function runAction<T>(body: () => Promise<ActionState<T>>): Promise<ActionState<T>> {
  try {
    return await body();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthorizationError) {
      return errorState(error.message);
    }
    console.error("[action] unexpected error", error instanceof Error ? error.message : error);
    return errorState("Something went wrong. Please try again.");
  }
}
