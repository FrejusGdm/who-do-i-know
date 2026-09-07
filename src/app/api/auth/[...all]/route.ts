import { auth } from "@/lib/auth";
import { consumeAuthAttempt } from "@/lib/password-setup";
import { isTrustedMutation, readJsonLimited, RequestError } from "@/lib/request-security";
import { toNextJsHandler } from "better-auth/next-js";

export const dynamic = "force-dynamic";
const allowedGet = new Set(["get-session", "list-sessions"]);
const allowedPost = new Set(["sign-in/username", "sign-out", "change-password", "revoke-session", "revoke-sessions", "revoke-other-sessions"]);

async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  const allowed = request.method === "GET" ? allowedGet : allowedPost;
  if (!allowed.has(path)) return Response.json({ error: "Authentication method unavailable" }, { status: 404 });
  try {
    const origin = process.env.BETTER_AUTH_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
    if (!isTrustedMutation(request, origin)) throw new RequestError(403, "Untrusted request origin");
    if (request.method === "POST") {
      // Read the bounded stream once; avoid an unbounded tee for a cloned body.
      const body = await readJsonLimited(request, 8192);
      request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
      if (path === "sign-in/username") await consumeAuthAttempt("login");
    }
    const handlers = toNextJsHandler(auth);
    const response = await (request.method === "GET" ? handlers.GET(request) : handlers.POST(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof RequestError ? error.message : "Sign-in is temporarily unavailable" },
      { status: error instanceof RequestError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
