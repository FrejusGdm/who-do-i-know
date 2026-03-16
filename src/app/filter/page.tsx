"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { FilterPanel } from "@/components/filter/FilterPanel";
import type { FilterConfig, LLMProviderMode } from "@/types";

export default function FilterPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [session, isPending, router]);

  const handleSubmit = async (
    config: FilterConfig,
    providerMode: LLMProviderMode,
    byokApiKey?: string
  ) => {
    setIsSubmitting(true);

    if (providerMode === "local") {
      sessionStorage.setItem("filterConfig", JSON.stringify(config));
      sessionStorage.setItem("providerMode", "local");
      router.push("/checkout");
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterConfig: config, providerMode, byokApiKey }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
        <div className="animate-pulse text-[--brand-muted]">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-4xl font-bold mb-2">
          Configure Your Scan
        </h1>
        <p className="text-[--brand-muted] mb-8">
          Shape what gets scanned before you pay.
        </p>
        <FilterPanel onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </main>
  );
}
