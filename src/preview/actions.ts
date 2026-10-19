"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState } from "@/lib/action-state";
import { moveApplicationSchema, STAGE_LABELS } from "@/lib/validation/application";
import { isPreviewEnabled } from "./enabled";
import { movePreviewApplication, resetPreview } from "./store";

/**
 * Preview counterpart of moveApplicationStageAction: same contract, in-memory effect,
 * no database and no authentication. Refuses to run when preview mode is disabled.
 */
export async function previewMoveApplicationStageAction(
  _orgSlug: string,
  input: { applicationId: string; stage: string },
): Promise<ActionState> {
  if (!isPreviewEnabled()) return errorState("Preview mode is disabled");
  const parsed = moveApplicationSchema.safeParse(input);
  if (!parsed.success) return errorState("Unknown stage");
  if (!movePreviewApplication(parsed.data.applicationId, parsed.data.stage)) {
    return errorState("This application no longer exists");
  }
  revalidatePath("/preview", "layout");
  return {
    status: "success",
    message: `Moved to ${STAGE_LABELS[parsed.data.stage]} (preview)`,
    data: undefined,
  };
}

/** Restores the synthetic data set. */
export async function previewResetAction(): Promise<void> {
  if (!isPreviewEnabled()) return;
  resetPreview();
  revalidatePath("/preview", "layout");
}
