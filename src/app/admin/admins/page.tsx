import type { Metadata } from "next";
import { GrantAdminForm } from "@/components/forms/grant-admin-form";
import { FadeIn } from "@/components/motion/fade-in";
import { formatDateTime, PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPlatformAdmins } from "@/server/data/admin";

export const metadata: Metadata = { title: "Platform admins" };

export default async function PlatformAdminsPage() {
  const admins = await listPlatformAdmins();

  return (
    <FadeIn>
      <PageHeader
        title="Platform admins"
        description="People who can create organizations, invite users and act inside any workspace. Grants are audited."
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(320px,400px)]">
        <section className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.userId}>
                  <TableCell className="font-medium">{admin.email}</TableCell>
                  <TableCell>{admin.fullName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(admin.grantedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{admin.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Grant platform admin</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            New people receive a one-time link to set their password.
          </p>
          <div className="rounded-lg border bg-card p-5">
            <GrantAdminForm />
          </div>
        </section>
      </div>
    </FadeIn>
  );
}
