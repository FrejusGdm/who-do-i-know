import { networkResponse } from "@/lib/network/api";
import {
  changePersonalUpdate,
  editPersonalUpdateInput,
} from "@/lib/network/personal-updates";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ updateId: string }> },
) {
  return networkResponse(request, async (owner) => ({
    update: await changePersonalUpdate(
      owner,
      (await params).updateId,
      editPersonalUpdateInput.parse(await readJsonLimited(request)),
    ),
  }));
}
