/**
 * Decides where a signed-in user lands after login or when opening "/".
 * Pure so it can be unit-tested without a database.
 */
export type LandingInput = {
  isPlatformAdmin: boolean;
  organizationSlugs: string[];
};

export function resolveLandingPath({ isPlatformAdmin, organizationSlugs }: LandingInput): string {
  if (isPlatformAdmin) return "/admin";
  if (organizationSlugs.length === 1) return `/o/${organizationSlugs[0]}`;
  if (organizationSlugs.length > 1) return "/workspaces";
  return "/no-access";
}
