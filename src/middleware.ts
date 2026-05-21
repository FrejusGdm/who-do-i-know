import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhook/",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("better-auth.session_token");
  if (!sessionCookie?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
