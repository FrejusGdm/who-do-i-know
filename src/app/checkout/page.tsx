"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/filter");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
      <div className="text-[--brand-muted]">Checkout is disabled. Redirecting...</div>
    </main>
  );
}
