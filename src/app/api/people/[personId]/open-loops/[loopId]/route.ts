import { networkResponse } from "@/lib/network/api";
import { updateOpenLoop, updateOpenLoopInput } from "@/lib/network/open-loops";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string; loopId: string }> },
) {
  return networkResponse(request, async (owner) => {
    const { personId, loopId } = await params;
    return {
      loop: await updateOpenLoop(
        owner,
        personId,
        loopId,
        updateOpenLoopInput.parse(await readJsonLimited(request)),
      ),
    };
  });
}
