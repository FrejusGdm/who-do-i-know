import { networkResponse } from "@/lib/network/api";
import { recordInteraction } from "@/lib/network/store";
import { interactionInput } from "@/lib/network/input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  return networkResponse(request, async (owner) => {
    const { personId } = await params;
    const body = await readJsonLimited(request);
    const input = interactionInput.parse({
      ...(body && typeof body === "object" ? body : {}),
      personIds: [personId],
    });
    return { interaction: await recordInteraction(owner, input) };
  });
}
