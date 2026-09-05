import { networkResponse } from "@/lib/network/api";
import { createCircle } from "@/lib/network/store";
import { circleInput } from "@/lib/network/input";
import { networkCircles } from "@/lib/network/queries";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return networkResponse(request, async (owner) => ({
    circles: await networkCircles(owner),
  }));
}
export async function POST(request: Request) {
  return networkResponse(request, async (owner) => ({
    circle: await createCircle(
      owner,
      circleInput.parse(await readJsonLimited(request)),
    ),
  }));
}
