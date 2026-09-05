import { networkResponse } from "@/lib/network/api";
import { actOnPlan, savePlan } from "@/lib/network/store";
import { planActionInput, planInput } from "@/lib/network/input";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ personId: string }> };
export async function PUT(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    plan: await savePlan(
      owner,
      (await params).personId,
      planInput.parse(await readJsonLimited(request)),
    ),
  }));
}
export async function PATCH(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    plan: await actOnPlan(
      owner,
      (await params).personId,
      planActionInput.parse(await readJsonLimited(request)),
    ),
  }));
}
