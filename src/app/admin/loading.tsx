import { PageSkeleton } from "@/components/page-skeleton";

/** Admin pages render live data on the server; show the frame immediately (ADR-042). */
export default function AdminLoading() {
  return <PageSkeleton cards={3} />;
}
