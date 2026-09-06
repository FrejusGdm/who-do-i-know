import { NextRequest, NextResponse } from "next/server";
import { isTrustedMutation } from "@/lib/request-security";

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhook/stripe",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const configuredOrigin = process.env.BETTER_AUTH_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!isTrustedMutation(request, configuredOrigin)) {
    return NextResponse.json({ error: "Untrusted request origin" }, { status: 403 });
  }
  const token = request.cookies.get("__Secure-better-auth.session_token")?.value ?? request.cookies.get("better-auth.session_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
