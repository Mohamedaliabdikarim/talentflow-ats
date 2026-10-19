import type { Metadata } from "next";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/components/views/audit-table";
import { listAuditEvents } from "@/server/data/admin";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  const events = await listAuditEvents(200);
  return (
    <FadeIn>
      <PageHeader
        title="Audit log"
        description="Security-relevant actions. The actor is always the authenticated user who performed the action."
      />
      <AuditTable events={events} />
    </FadeIn>
  );
}
