import { networkResponse } from "@/lib/network/api";
import { saveInterviewDraft } from "@/lib/network/interviews";
import { interviewDraftInput } from "@/lib/network/interview-input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  return networkResponse(request, async (owner) =>
    saveInterviewDraft(
      owner,
      (await params).interviewId,
      interviewDraftInput.parse(await readJsonLimited(request)),
    ),
  );
}
