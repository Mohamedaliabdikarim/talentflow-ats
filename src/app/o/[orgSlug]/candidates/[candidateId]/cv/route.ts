import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { CV_BUCKET, CV_CONTENT_TYPE } from "@/lib/validation/cv";
import { getOrganizationContext } from "@/server/auth";

/**
 * Streams a candidate's CV through the server (ADR-033). The file is fetched with the
 * user-scoped client, so the candidates RLS policy and the storage.objects policy both
 * authorize it; a signed or public URL is never produced or sent to the browser. `?download=1`
 * serves it as an attachment, otherwise inline. A caller without access to the organization
 * gets a 404 that reveals nothing. The proxy already blocks unauthenticated requests here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; candidateId: string }> },
) {
  const { orgSlug, candidateId } = await params;
  const organization = await getOrganizationContext(orgSlug);
  if (!organization) return new NextResponse("Not found", { status: 404 });

  const supabase = await createServerSupabase();
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("cv_object_key, cv_filename")
    .eq("id", candidateId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error || !candidate?.cv_object_key) return new NextResponse("Not found", { status: 404 });

  const download = await supabase.storage.from(CV_BUCKET).download(candidate.cv_object_key);
  if (download.error || !download.data) return new NextResponse("Not found", { status: 404 });

  const buffer = await download.data.arrayBuffer();
  const asAttachment = request.nextUrl.searchParams.get("download") === "1";
  // Filename is already sanitized on upload; strip quotes defensively for the header.
  const filename = (candidate.cv_filename ?? "cv.pdf").replace(/["\r\n]/g, "");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": CV_CONTENT_TYPE,
      "Content-Disposition": `${asAttachment ? "attachment" : "inline"}; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
