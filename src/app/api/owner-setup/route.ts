import { completeOwnerSetup, consumeAuthAttempt } from "@/lib/password-setup";
import { isTrustedMutation, readJsonLimited, RequestError } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
    if (!isTrustedMutation(request, origin)) throw new RequestError(403, "Untrusted request origin");
    const body = await readJsonLimited(request, 8192);
    await consumeAuthAttempt("setup");
    await completeOwnerSetup(body);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RequestError ? error.message : "Account setup could not be completed. Please try again." },
      { status: error instanceof RequestError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
