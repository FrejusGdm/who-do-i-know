import { networkResponse } from "@/lib/network/api";
import { appendInterviewTurn } from "@/lib/network/interviews";
import { appendTurnInput } from "@/lib/network/interview-input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ interviewId: string }> },
) {
  return networkResponse(request, async (owner) =>
    appendInterviewTurn(
      owner,
      (await params).interviewId,
      appendTurnInput.parse(await readJsonLimited(request)),
    ),
  );
}
