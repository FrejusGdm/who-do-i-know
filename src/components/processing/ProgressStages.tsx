"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const STAGES = [
  {
    id: "connect",
    label: "Connecting to Gmail",
    copies: [
      "Shaking hands with Google...",
      "Establishing secure connection...",
    ],
  },
  {
    id: "fetch",
    label: "Fetching your email threads",
    copies: [
      "Digging through years of emails...",
      "Sorting through the reply-all chaos...",
    ],
  },
  {
    id: "filter",
    label: "Filtering out the noise",
    copies: [
      "Removing newsletters, dining halls, spam...",
      "Separating the signal from the noise...",
    ],
  },
  {
    id: "analyze",
    label: "Identifying real contacts",
    copies: [
      "AI is reading the vibes...",
      "Figuring out who actually matters...",
      "Analyzing relationship patterns...",
    ],
  },
  {
    id: "build",
    label: "Building your spreadsheet",
    copies: [
      "Almost there, formatting nicely...",
      "Putting the finishing touches...",
    ],
  },
  {
    id: "ready",
    label: "Your network is ready",
    copies: ["That's everyone you know."],
  },
];

interface ProgressStagesProps {
  currentStage: string;
  currentCopy: string;
  contactCount?: number;
}

export function ProgressStages({
  currentStage,
  currentCopy,
  contactCount,
}: ProgressStagesProps) {
  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);

  return (
    <div className="space-y-4">
      {STAGES.map((stage, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;

        return (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex items-start gap-5 p-5 rounded-2xl transition-all duration-500 border ${
              isCurrent
                ? "bg-white shadow-sm border-black/5"
                : isComplete
                  ? "bg-white/40 border-transparent backdrop-blur-sm"
                  : "opacity-40 border-transparent"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isComplete && (
                <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-[--brand-ink]" strokeWidth={2.5} />
                </div>
              )}
              {isCurrent && (
                <div className="w-6 h-6 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-[--brand-ink] animate-spin" />
                </div>
              )}
              {isPending && (
                <div className="w-6 h-6 rounded-full border-2 border-black/10" />
              )}
            </div>
            <div>
              <p className={`font-medium ${isCurrent ? 'text-[--brand-ink]' : 'text-[--brand-muted]'}`}>
                {stage.label}
              </p>
              {isCurrent && (
                <p className="text-sm text-[--brand-muted] mt-1.5 leading-relaxed">
                  {currentCopy || stage.copies[0]}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}

      {contactCount !== undefined && contactCount > 0 && (
        <div className="text-center mt-8">
          <p className="inline-block text-sm font-medium text-[--brand-muted] bg-white/50 backdrop-blur-sm border border-black/5 rounded-full py-2 px-4 shadow-sm">
            <span className="text-[--brand-ink]">{contactCount}</span> contacts found so far
          </p>
        </div>
      )}
    </div>
  );
}
