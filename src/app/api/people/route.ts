import { networkResponse } from "@/lib/network/api";
import { createPerson } from "@/lib/network/store";
import { personInput } from "@/lib/network/input";
import { networkPeople } from "@/lib/network/queries";
import { readJsonLimited } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return networkResponse(request, async (owner) =>
    networkPeople(owner, Object.fromEntries(new URL(request.url).searchParams)),
  );
}
export async function POST(request: Request) {
  return networkResponse(request, async (owner) => ({
    person: await createPerson(
      owner,
      personInput.parse(await readJsonLimited(request)),
    ),
  }));
}
