/**
 * Local preview mode renders the real UI with synthetic data and no authentication.
 * It is available in development, or in a production build only when the operator
 * sets TALENTFLOW_PREVIEW=1 explicitly. The Azure deployment never sets it, so the
 * /preview routes are a 404 there (and the proxy keeps them behind authentication).
 */
export function isPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.TALENTFLOW_PREVIEW === "1";
}

export const PREVIEW_ORG_SLUG = "northwind";
export const PREVIEW_BASE = `/preview/o/${PREVIEW_ORG_SLUG}`;
