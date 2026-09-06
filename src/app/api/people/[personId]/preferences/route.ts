import { networkResponse } from "@/lib/network/api";
import {
  personPreferences,
  preferenceInput,
  savePersonPreferences,
} from "@/lib/network/conversation-preferences";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ personId: string }> };
export async function GET(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    preferences: await personPreferences(owner, (await params).personId),
  }));
}
export async function PUT(request: Request, { params }: Context) {
  return networkResponse(request, async (owner) => ({
    preferences: await savePersonPreferences(
      owner,
      (await params).personId,
      preferenceInput.parse(await readJsonLimited(request)),
    ),
  }));
}
