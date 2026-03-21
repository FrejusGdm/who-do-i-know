"use client";

import { useEffect, useState, useRef } from "react";
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

export function ProcessingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentStage, setCurrentStage] = useState("connect");
  const [currentCopy, setCurrentCopy] = useState(
    "Shaking hands with Google..."
  );
  const [contactCount, setContactCount] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
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
          setCurrentStage("ready");
          setCurrentCopy(data.copy);
          setContactCount(data.contactCount);
          es.close();
          setTimeout(() => {
            router.push(`/download/${jobId}`);
          }, 2000);
          return;
        }

        setCurrentStage(data.stage);
        setCurrentCopy(data.copy);
        if (data.contactCount !== undefined) {
          setContactCount(data.contactCount);
        }
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
  }, [jobId, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream] px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <h1 className="font-serif text-3xl font-bold text-center mb-2">
          Processing Your Network
        </h1>
        <p className="text-center text-sm text-[--brand-muted] mb-8">
          Usually 2–5 minutes
        </p>

        {error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-700 mb-4">{error}</p>
            <p className="text-xs text-[--brand-muted]">
              Need help? Contact support@whodoyouknow.xyz
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>
        ) : (
          <ProgressStages
            currentStage={currentStage}
            currentCopy={currentCopy}
            contactCount={contactCount}
          />
        )}
      </motion.div>
    </main>
  );
}
