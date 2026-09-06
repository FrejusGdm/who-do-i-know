import { networkResponse } from "@/lib/network/api";
import { changeInterviewStatus, getInterview } from "@/lib/network/interviews";
import { interviewStatusInput } from "@/lib/network/interview-input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ interviewId: string }> };
export async function GET(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) =>
    getInterview(owner, (await params).interviewId),
  );
}
export async function PATCH(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    interview: await changeInterviewStatus(
      owner,
      (await params).interviewId,
      interviewStatusInput.parse(await readJsonLimited(request)),
    ),
  }));
}
