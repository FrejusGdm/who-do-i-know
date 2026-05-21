import { NextRequest, NextResponse, after } from "next/server";
import { eq, and } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { jobs, account, user } from "@/db/schema";
import { runCloudPipeline } from "@/lib/pipeline";
import type Stripe from "stripe";
import type { FilterConfig, LLMProviderMode } from "@/types";

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

    // Run pipeline directly via after() instead of HTTP fetch to /api/process
    after(async () => {
      try {
        const [owner] = await db
          .select()
          .from(user)
          .where(eq(user.email, metadata.userEmail))
          .limit(1);

        if (!owner) {
          console.error("[Webhook] User not found for pipeline:", metadata.userEmail);
          return;
        }

        const [googleAccount] = await db
          .select()
          .from(account)
          .where(
            and(
              eq(account.userId, owner.id),
              eq(account.providerId, "google")
            )
          )
          .limit(1);

        if (!googleAccount?.accessToken) {
          console.error("[Webhook] No Google access token for user");
          return;
        }

        await runCloudPipeline(
          job.id,
          owner.id,
          googleAccount.accessToken,
          JSON.parse(metadata.filterConfig) as FilterConfig,
          metadata.userEmail,
          (metadata.providerMode ?? "cloud") as LLMProviderMode
        );
      } catch (e) {
        console.error("[Webhook] Pipeline error:", e);
      }
    });
  }

  return NextResponse.json({ received: true });
}
