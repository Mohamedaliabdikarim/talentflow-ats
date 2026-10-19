import { redirect } from "next/navigation";
import { resolveLandingPath } from "@/lib/landing";
import { getCurrentUser, getMyOrganizations, isPlatformAdmin } from "@/server/auth";

/** Post-login router: sends each user to the one place they can act. */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [admin, organizations] = await Promise.all([isPlatformAdmin(), getMyOrganizations()]);
  redirect(
    resolveLandingPath({
      isPlatformAdmin: admin,
      organizationSlugs: organizations.map((organization) => organization.slug),
    }),
  );
}
