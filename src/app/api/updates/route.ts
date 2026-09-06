import { networkResponse } from "@/lib/network/api";
import {
  createPersonalUpdate,
  createPersonalUpdateInput,
  listPersonalUpdates,
} from "@/lib/network/personal-updates";
import { readJsonLimited } from "@/lib/request-security";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return networkResponse(request, (owner) =>
    listPersonalUpdates(
      owner,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(new URL(request.url).searchParams.get("page") ?? 1),
    ),
  );
}
export async function POST(request: Request) {
  return networkResponse(
    request,
    async (owner) => ({
      update: await createPersonalUpdate(
        owner,
        createPersonalUpdateInput.parse(await readJsonLimited(request)),
      ),
    }),
    201,
  );
}
