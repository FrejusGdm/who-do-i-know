"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { FilterPanel } from "@/components/filter/FilterPanel";
import type { FilterConfig, LLMProviderMode, BYOKProvider } from "@/types";

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
    byokApiKey?: string,
    ollamaModel?: string,
    byokProvider?: BYOKProvider
  ) => {
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterConfig: config, providerMode, byokApiKey, ollamaModel, byokProvider }),
      });

      const data = await res.json();
      if (data.jobId) {
        router.push(`/processing?jobId=${data.jobId}`);
      }
    } catch (error) {
      console.error("Job creation error:", error);
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
    <main className="min-h-screen bg-[--brand-cream] py-24 px-6">
      <div className="max-w-2xl mx-auto">
        <FilterPanel onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </main>
  );
}
