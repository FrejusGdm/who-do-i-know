import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Checkout is disabled for the private relationship memory app. Use /api/job." },
    { status: 410 },
  );
}
