import { EmptyState, formatDateTime } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditRow } from "@/server/data/admin";

export function AuditTable({ events }: { events: AuditRow[] }) {
  if (events.length === 0) {
    return (
      <EmptyState title="No events yet" description="Provisioning and admin actions appear here." />
    );
  }
  return (
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
  );
}
