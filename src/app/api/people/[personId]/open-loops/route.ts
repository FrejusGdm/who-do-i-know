import { networkResponse } from "@/lib/network/api";
import {
  createOpenLoop,
  createOpenLoopInput,
  personOpenLoops,
} from "@/lib/network/open-loops";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ personId: string }> };
export async function GET(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    loops: await personOpenLoops(owner, (await params).personId),
  }));
}
export async function POST(request: Request, { params }: Context) {
  return networkResponse(
    request,
    async (owner) => ({
      loop: await createOpenLoop(
        owner,
        (await params).personId,
        createOpenLoopInput.parse(await readJsonLimited(request)),
      ),
    }),
    201,
  );
}
