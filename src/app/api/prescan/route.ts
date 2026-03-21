import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { countThreads } from "@/lib/gmail";
import type { FilterConfig } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.session?.token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token" },
        { status: 401 }
      );
    }

    const filters: FilterConfig = await req.json();
    const count = await countThreads(accessToken, filters);

    return NextResponse.json({ estimatedContacts: count });
  } catch (error) {
    console.error("Prescan error:", error);
    return NextResponse.json(
      { error: "Failed to estimate contacts" },
      { status: 500 }
    );
  }
}
