import { networkResponse } from "@/lib/network/api";
import {
  correctionInput,
  correctInterviewTurn,
  previewInterviewCorrection,
} from "@/lib/network/interview-corrections";
import { getInterview } from "@/lib/network/interviews";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ interviewId: string; turnId: string }> };
export async function GET(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => {
    const { interviewId, turnId } = await params;
    return previewInterviewCorrection(owner, interviewId, turnId);
  });
}
export async function PATCH(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => {
    const { interviewId, turnId } = await params;
    await correctInterviewTurn(
      owner,
      interviewId,
      turnId,
      correctionInput.parse(await readJsonLimited(request)),
    );
    return getInterview(owner, interviewId);
  });
}
