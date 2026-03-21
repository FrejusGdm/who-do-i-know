"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function CheckoutPage() {
  const router = useRouter();

  useEffect(() => {
    const providerMode = sessionStorage.getItem("providerMode");
    if (providerMode !== "local") {
      router.push("/filter");
    }
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center px-6"
      >
        <h1 className="font-serif text-4xl font-bold mb-4">Checkout</h1>
        <p className="text-[--brand-muted] mb-8">
          One-time payment of $9. You&apos;ll be redirected to Stripe.
        </p>
        <div className="animate-pulse text-[--brand-muted]">
          Redirecting to payment...
        </div>
      </motion.div>
    </main>
  );
}
