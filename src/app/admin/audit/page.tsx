import type { Metadata } from "next";
import { FadeIn } from "@/components/motion/fade-in";
import { EmptyState, formatDateTime, PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Provisioning and admin actions appear here."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {event.action}
                    </code>
                  </TableCell>
                  <TableCell>{event.actorEmail ?? "system"}</TableCell>
                  <TableCell>{event.organizationName ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {event.targetType ? `${event.targetType} ${event.targetId ?? ""}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FadeIn>
  );
}
