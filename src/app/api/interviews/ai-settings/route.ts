import { networkResponse } from "@/lib/network/api";
import {
  aiConsentInput,
  interviewAIStatus,
  setInterviewAIConsent,
} from "@/lib/network/interview-jobs";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return networkResponse(request, async (owner) => interviewAIStatus(owner));
}
export async function PUT(request: Request) {
  return networkResponse(request, async (owner) =>
    setInterviewAIConsent(
      owner,
      aiConsentInput.parse(await readJsonLimited(request)),
    ),
  );
}
