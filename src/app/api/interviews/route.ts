import { networkResponse } from "@/lib/network/api";
import { createInterview, listInterviews } from "@/lib/network/interviews";
import { createInterviewInput } from "@/lib/network/interview-input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return networkResponse(request, async (owner) => ({
    interviews: await listInterviews(owner),
  }));
}
export async function POST(request: Request) {
  return networkResponse(request, async (owner) => ({
    interview: await createInterview(
      owner,
      createInterviewInput.parse(await readJsonLimited(request)),
    ),
  }));
}
