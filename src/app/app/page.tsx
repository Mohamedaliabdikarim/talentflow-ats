import { redirect } from "next/navigation";
import { resolveLandingPath } from "@/lib/landing";
import { getCurrentUser, getMyOrganizations, isPlatformAdmin } from "@/server/auth";

/**
 * Post-login router: sends each signed-in user to the one place they can act.
 * Lives at /app so the public landing page can own "/".
 */
export default async function AppEntryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fapp");

  const [admin, organizations] = await Promise.all([isPlatformAdmin(), getMyOrganizations()]);
  redirect(
    resolveLandingPath({
      isPlatformAdmin: admin,
      organizationSlugs: organizations.map((organization) => organization.slug),
    }),
  );
}
