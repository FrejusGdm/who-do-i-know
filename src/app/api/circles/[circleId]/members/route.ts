import { z } from "zod";
import { networkResponse } from "@/lib/network/api";
import { setCircleMembership } from "@/lib/network/store";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ circleId: string }> },
) {
  return networkResponse(request, async (owner) => {
    const { circleId } = await params;
    const input = z
      .object({ personId: z.string().uuid(), member: z.boolean() })
      .strict()
      .parse(await readJsonLimited(request));
    await setCircleMembership(owner, circleId, input.personId, input.member);
    return { saved: true };
  });
}
