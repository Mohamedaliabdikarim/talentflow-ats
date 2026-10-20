import { z } from "zod";
import { emptyToUndefined, optionalText } from "./common";
import { organizationSlugSchema } from "./organization";

export const MEMBERSHIP_ROLES = ["owner", "member"] as const;
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organization name").max(120),
  // Optional: derived from the name when left empty (see slugify()).
  slug: z.preprocess(emptyToUndefined, organizationSlugSchema.optional()),
});

export const inviteUserSchema = z.object({
  organizationId: z.uuid("Unknown organization"),
  email: z.email("Enter a valid email address").max(254),
  fullName: optionalText(160),
  role: membershipRoleSchema.default("member"),
});

export const reissueInvitationSchema = z.object({
  membershipId: z.uuid("Unknown membership"),
});

export const grantPlatformAdminSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  fullName: optionalText(160),
  note: optionalText(500),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type GrantPlatformAdminInput = z.infer<typeof grantPlatformAdminSchema>;
