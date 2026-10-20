"use server";

import { type ActionState, errorState } from "@/lib/action-state";
import { AiError, isAzureOpenAIConfigured } from "@/lib/ai/client";
import {
  type CandidatePrefill,
  EXTRACTION_NOT_CONFIGURED_MESSAGE,
} from "@/lib/ai/candidate-extract-contract";
import { extractCandidateDetails } from "@/lib/ai/candidate-extract";
import { extractCvText, InsightRunError } from "@/lib/ai/job-match";
import { hasPdfSignature, validateCvMetadata } from "@/lib/validation/cv";
import { runAction } from "@/server/actions/run";
import { recordAuditEvent } from "@/server/audit";
import { requireOrgAccess } from "@/server/auth";

/**
 * Extracts contact and profile details from a CV the recruiter has just chosen in the "Add
 * candidate" form (ADR-039). The CV is validated exactly like an upload, read in memory, sent
 * once to Azure OpenAI with a strict schema, and the validated result is returned as a prefill
 * for the recruiter to review. Nothing is stored, no candidate exists yet, no insight is queued,
 * and no AI-use authorization is recorded or implied; the audit row carries counts only.
 *
 * Failures are returned as error states with content-free messages so the form stays usable
 * for manual entry.
 */

export async function extractCandidateDetailsAction(
  orgSlug: string,
  formData: FormData,
): Promise<ActionState<CandidatePrefill>> {
  return runAction<CandidatePrefill>(async () => {
    const organization = await requireOrgAccess(orgSlug);
    const file = formData.get("cv");
    if (!(file instanceof File) || file.size === 0) {
      return errorState("Choose a PDF file to extract details from.", {
        cv: ["Choose a PDF file"],
      });
    }
    const metadata = validateCvMetadata({ name: file.name, type: file.type, size: file.size });
    if (!metadata.ok) return errorState(metadata.message, { cv: [metadata.message] });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasPdfSignature(bytes.subarray(0, 5))) {
      return errorState("That file is not a valid PDF.", { cv: ["Not a valid PDF"] });
    }
    if (!isAzureOpenAIConfigured()) return errorState(EXTRACTION_NOT_CONFIGURED_MESSAGE);

    try {
      const text = await extractCvText(bytes);
      const extraction = await extractCandidateDetails(text);
      await recordAuditEvent("candidate.cv_details_extracted", {
        organizationId: organization.id,
        targetType: "candidate_draft",
        metadata: {
          fields: Object.keys(extraction.values).length,
          warnings: extraction.warnings.length,
          model: extraction.model,
        },
      });
      return {
        status: "success",
        message:
          Object.keys(extraction.values).length > 0
            ? "Details extracted from the CV. Review and correct them before saving."
            : "No contact details were found in the CV. Enter them manually.",
        data: { values: extraction.values, warnings: extraction.warnings },
      };
    } catch (error) {
      if (error instanceof AiError || error instanceof InsightRunError) {
        return errorState(`Could not extract details from the CV: ${error.message}`);
      }
      throw error;
    }
  });
}
