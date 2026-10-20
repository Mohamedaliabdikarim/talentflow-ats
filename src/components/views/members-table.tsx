import { formatDateTime } from "@/components/page-header";
import { ResendInviteButton } from "@/components/forms/resend-invite-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Enums } from "@/lib/supabase/database.types";
import type { MemberRow } from "@/server/data/admin";

const STATUS_LABELS: Record<Enums<"membership_status">, string> = {
  invited: "Invited",
  active: "Active",
  disabled: "Deactivated",
};

/**
 * Members list. `showResend` adds an Invitation column with a "Resend invite" control for
 * pending members, and `renderActions` adds a Manage column (role change, deactivate,
 * reactivate). Both are used only in the platform-admin organization view, never in the
 * customer workspace, where membership is managed by the platform admin (ADR-040).
 */
export function MembersTable({
  members,
  showResend = false,
  renderActions,
}: {
  members: MemberRow[];
  showResend?: boolean;
  renderActions?: (member: MemberRow) => React.ReactNode;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No members yet.
      </p>
    );
  }
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Since</TableHead>
            {showResend ? <TableHead>Invitation</TableHead> : null}
            {renderActions ? <TableHead>Manage</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.membershipId}>
              <TableCell className="font-medium">{member.email}</TableCell>
              <TableCell>{member.fullName || "—"}</TableCell>
              <TableCell className="capitalize">{member.role}</TableCell>
              <TableCell>
                <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                  {STATUS_LABELS[member.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(member.createdAt)}
              </TableCell>
              {showResend ? (
                <TableCell className="min-w-56">
                  {member.status === "invited" ? (
                    <ResendInviteButton membershipId={member.membershipId} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ) : null}
              {renderActions ? (
                <TableCell className="min-w-64">{renderActions(member)}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
