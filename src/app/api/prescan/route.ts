import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { countThreads } from "@/lib/gmail";
import { db } from "@/db";
import { account } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { FilterConfig } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [googleAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "google")
        )
      )
      .limit(1);

    const accessToken = googleAccount?.accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No Google access token found" },
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
