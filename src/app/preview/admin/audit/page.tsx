import type { Metadata } from "next";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/page-header";
import { AuditTable } from "@/components/views/audit-table";
import { PREVIEW_AUDIT_EVENTS } from "@/preview/demo-data";

export const metadata: Metadata = { title: "Audit log (preview)" };

export default function PreviewAuditPage() {
  return (
    <FadeIn>
      <PageHeader
        title="Audit log"
        description="Security-relevant actions. The actor is always the authenticated user who performed the action."
      />
      <AuditTable events={PREVIEW_AUDIT_EVENTS} />
    </FadeIn>
  );
}
