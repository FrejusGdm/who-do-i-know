import { networkResponse } from "@/lib/network/api";
import {
  interviewJob,
  queueInterview,
  queueInterviewInput,
} from "@/lib/network/interview-jobs";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  return networkResponse(request, async (owner) => ({
    job: await interviewJob(owner, (await params).interviewId),
  }));
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  return networkResponse(
    request,
    async (owner) => ({
      job: await queueInterview(
        owner,
        (await params).interviewId,
        queueInterviewInput.parse(await readJsonLimited(request)),
      ),
    }),
    202,
  );
}
