"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ProgressStages } from "./ProgressStages";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProgressData {
  stage: string;
  stageIndex: number;
  copy: string;
  contactCount?: number;
}

const STAGE_ORDER = ["connect", "fetch", "filter", "analyze", "build", "ready"];
const STAGE_DELAY = 1000; // 1 second minimum between stage transitions

export function ProcessingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // What the UI shows (staggered)
  const [displayedStage, setDisplayedStage] = useState("connect");
  const [displayedCopy, setDisplayedCopy] = useState("Shaking hands with Google...");
  const [contactCount, setContactCount] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Queue of stage events from backend, replayed with stagger
  const eventQueueRef = useRef<ProgressData[]>([]);
  const isAdvancingRef = useRef(false);
  const displayedIndexRef = useRef(0);

  const advanceStage = useCallback(() => {
    if (isAdvancingRef.current) return;
    const queue = eventQueueRef.current;
    if (queue.length === 0) return;

    isAdvancingRef.current = true;

    const processNext = () => {
      if (queue.length === 0) {
        isAdvancingRef.current = false;
        return;
      }

      const next = queue[0];
      const nextIndex = STAGE_ORDER.indexOf(next.stage);

      // Only advance forward, skip duplicate/older stages
      if (nextIndex <= displayedIndexRef.current && next.stage !== "ready") {
        // Still update copy/count for same stage (e.g. "7 contacts so far...")
        if (nextIndex === displayedIndexRef.current) {
          setDisplayedCopy(next.copy);
          if (next.contactCount !== undefined) setContactCount(next.contactCount);
        }
        queue.shift();
        processNext();
        return;
      }

      // Advance one stage at a time with delay
      const targetIndex = Math.min(nextIndex, displayedIndexRef.current + 1);
      const targetStage = STAGE_ORDER[targetIndex];

      setTimeout(() => {
        displayedIndexRef.current = targetIndex;
        setDisplayedStage(targetStage);

        // If we've caught up to this event, use its copy
        if (targetIndex === nextIndex) {
          setDisplayedCopy(next.copy);
          if (next.contactCount !== undefined) setContactCount(next.contactCount);
          queue.shift();
        }

        // If this was "ready", redirect after showing it
        if (targetStage === "ready") {
          isAdvancingRef.current = false;
          return;
        }

        processNext();
      }, STAGE_DELAY);
    };

    processNext();
  }, []);

  useEffect(() => {
    const directJobId = searchParams.get("jobId");
    if (directJobId) {
      setJobId(directJobId);
      return;
    }

    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    const pollForJob = async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(
            `/api/job/by-session?sessionId=${sessionId}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.jobId) {
              setJobId(data.jobId);
              return;
            }
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setError(
        "Payment received — processing will begin shortly. Please refresh the page."
      );
    };

    pollForJob();
  }, [searchParams]);

  // Handle redirect when "ready" stage is displayed
  useEffect(() => {
    if (displayedStage === "ready" && jobId) {
      const timeout = setTimeout(() => {
        router.push(`/download/${jobId}`);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [displayedStage, jobId, router]);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/progress/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: ProgressData & { type: string } = JSON.parse(event.data);
        if (data.type === "heartbeat") return;

        if (data.stage === "error") {
          setError(data.copy);
          es.close();
          return;
        }

        if (data.stage === "ready") {
          es.close();
        }

        // Queue the event and trigger staggered advance
        eventQueueRef.current.push(data);
        if (data.contactCount !== undefined) {
          setContactCount(data.contactCount);
        }
        advanceStage();
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [jobId, advanceStage]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream] px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight text-center text-[--brand-ink] mb-4">
          Processing Your Network
        </h1>
        <p className="text-center text-lg text-[--brand-muted] mb-12 font-light">
          Usually takes 2–5 minutes
        </p>

        {error ? (
          <div className="p-8 bg-white/50 backdrop-blur-sm border border-black/5 rounded-3xl text-center shadow-sm">
            <AlertCircle className="w-10 h-10 text-[--brand-ink] mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-base text-[--brand-ink] mb-6">{error}</p>
            <p className="text-sm text-[--brand-muted] mb-6">
              Need help? Contact support@whodoyouknow.work
            </p>
            <Button
              variant="outline"
              className="rounded-full px-8 bg-white border-black/5 shadow-sm"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>
        ) : (
          <ProgressStages
            currentStage={displayedStage}
            currentCopy={displayedCopy}
            contactCount={contactCount}
          />
        )}
      </motion.div>
    </main>
  );
}
