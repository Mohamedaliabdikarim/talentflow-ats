import type { Metadata } from "next";
import { WorkspaceOverviewView } from "@/components/views/workspace-overview";
import { PREVIEW_ORGANIZATION } from "@/preview/demo-data";
import { PREVIEW_BASE } from "@/preview/enabled";
import { previewCounts } from "@/preview/store";

export const metadata: Metadata = { title: "Workspace (preview)" };

export default function PreviewWorkspaceOverviewPage() {
  return (
    <WorkspaceOverviewView
      base={PREVIEW_BASE}
      organizationName={PREVIEW_ORGANIZATION.name}
      counts={previewCounts()}
    />
  );
}
