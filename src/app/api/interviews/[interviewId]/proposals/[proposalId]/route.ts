import { networkResponse } from "@/lib/network/api";
import { getInterview, reviewMemoryProposal } from "@/lib/network/interviews";
import { reviewProposalInput } from "@/lib/network/interview-input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ interviewId: string; proposalId: string }> },
) {
  return networkResponse(request, async (owner) => {
    const { interviewId, proposalId } = await params;
    const proposal = await reviewMemoryProposal(
      owner,
      interviewId,
      proposalId,
      reviewProposalInput.parse(await readJsonLimited(request)),
    );
    return { proposal, snapshot: await getInterview(owner, interviewId) };
  });
}
