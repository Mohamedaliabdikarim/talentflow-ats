import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Mirrors the organizations_slug_format check constraint. */
export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(SLUG_PATTERN, "Use lowercase letters, digits and single hyphens");

export const organizationInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the organization name").max(120),
  slug: organizationSlugSchema,
});

export type OrganizationInput = z.infer<typeof organizationInputSchema>;

/**
 * Derives a URL-safe slug from a display name, e.g. "Northwind Hiring AS" -> "northwind-hiring-as".
 * Accents are stripped rather than transliterated to keep the result predictable.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
