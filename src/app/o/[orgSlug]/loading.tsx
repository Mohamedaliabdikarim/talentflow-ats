import { PageSkeleton } from "@/components/page-skeleton";

/** Workspace pages render tenant data on the server; show the frame immediately (ADR-042). */
export default function WorkspaceLoading() {
  return <PageSkeleton />;
}
