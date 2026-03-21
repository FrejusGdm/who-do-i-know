import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (!metadata?.userEmail || !metadata?.filterConfig) {
      console.error("Missing metadata in checkout session");
      return NextResponse.json({ received: true });
    }

    const [job] = await db
      .insert(jobs)
      .values({
        userEmail: metadata.userEmail,
        status: "pending",
        filterConfig: JSON.parse(metadata.filterConfig),
        providerMode: metadata.providerMode ?? "cloud",
        stripeSessionId: session.id,
      })
      .returning();

    const processUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/process`;
    fetch(processUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        stripeSessionId: session.id,
        byokApiKey: metadata.byokApiKey || undefined,
      }),
    }).catch((e) => console.error("Failed to trigger processing:", e));
  }

  return NextResponse.json({ received: true });
}
