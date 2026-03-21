"use client";

import { Suspense } from "react";
import { ProcessingContent } from "@/components/processing/ProcessingContent";

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
          <div className="animate-pulse text-[--brand-muted]">Loading...</div>
        </main>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
