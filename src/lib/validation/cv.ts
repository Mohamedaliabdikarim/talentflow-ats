/**
 * Candidate CV upload rules (docs/SECURITY.md §9). PDF only, server-side checks, a size
 * limit that matches the migration constraint and the Storage bucket configuration.
 * Pure and dependency-free so it can be unit-tested and reused by the Server Action.
 */

export const CV_BUCKET = "candidate-cvs";
export const CV_CONTENT_TYPE = "application/pdf";
/**
 * 4 MB (ADR-041). CVs travel through Server Actions, whose request body is capped by
 * `experimental.serverActions.bodySizeLimit` in next.config.ts and, on Vercel, by the platform's
 * 4.5 MB request limit. The database check (`candidates_cv_size_bytes_range`) and the Storage
 * bucket keep a 10 MB ceiling; this application limit is the stricter one and is what users see.
 */
export const CV_MAX_BYTES = 4 * 1024 * 1024;
/** Human-readable form of CV_MAX_BYTES for hints and error messages. */
export const CV_MAX_LABEL = "4 MB";
/** "%PDF-" — the PDF file signature (magic bytes). */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export type CvValidationResult =
  { ok: true; filename: string; size: number } | { ok: false; message: string };

/**
 * Turns an untrusted upload into a safe display filename: strips any path, drops control
 * characters, collapses whitespace, enforces a .pdf extension, and caps the length. The
 * result is used only for display and the download Content-Disposition, never as a storage
 * key (keys are server-generated UUIDs).
 */
export function sanitizeCvFilename(rawName: string | null | undefined): string {
  const base = (rawName ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const withoutPdf = base
    .replace(/\.pdf$/i, "")
    .slice(0, 120)
    .trim();
  const safe = withoutPdf.replace(/[^A-Za-z0-9 ._-]/g, "").trim();
  return `${safe.length > 0 ? safe : "cv"}.pdf`;
}

/** Validates metadata (type and size) without reading the file body. */
export function validateCvMetadata(file: {
  name?: string | null;
  type?: string | null;
  size?: number | null;
}): CvValidationResult {
  const size = file.size ?? 0;
  if (!size || size <= 0) return { ok: false, message: "The file is empty." };
  if (size > CV_MAX_BYTES) {
    return { ok: false, message: `The file is larger than the ${CV_MAX_LABEL} limit.` };
  }
  if ((file.type ?? "") !== CV_CONTENT_TYPE) {
    return { ok: false, message: "Only PDF files are accepted." };
  }
  return { ok: true, filename: sanitizeCvFilename(file.name), size };
}

/** Confirms the first bytes are the %PDF- signature, so a renamed non-PDF is rejected. */
export function hasPdfSignature(head: Uint8Array): boolean {
  if (head.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, index) => head[index] === byte);
}

/**
 * Full server-side validation: metadata plus the magic-byte signature read from the body.
 * `readHead` returns the first bytes of the file (the caller already has the bytes).
 */
export function validateCvFile(
  file: { name?: string | null; type?: string | null; size?: number | null },
  head: Uint8Array,
): CvValidationResult {
  const metadata = validateCvMetadata(file);
  if (!metadata.ok) return metadata;
  if (!hasPdfSignature(head)) {
    return { ok: false, message: "That file is not a valid PDF." };
  }
  return metadata;
}

/**
 * Server-generated, unpredictable object key. Only UUIDs appear in the path: the
 * organization id (so Storage RLS can authorize on the first segment), the candidate id,
 * and a random object id. No name, email or other personal data is ever in the key.
 */
export function buildCvObjectKey(
  organizationId: string,
  candidateId: string,
  randomId: string,
): string {
  return `${organizationId}/${candidateId}/${randomId}.pdf`;
}
