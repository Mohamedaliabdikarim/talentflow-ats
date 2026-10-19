"use server";

import { type ActionState, errorState } from "@/lib/action-state";

/** The landing showcase is rendered inert; this action exists only to satisfy the board's contract. */
export async function showcaseMoveAction(): Promise<ActionState> {
  return errorState("The product showcase is not interactive");
}
