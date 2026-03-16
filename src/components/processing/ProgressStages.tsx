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
            className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${
              isCurrent
                ? "bg-[--brand-gold]/10 border border-[--brand-gold]/20"
                : isComplete
                  ? "bg-green-50 border border-green-100"
                  : "opacity-40"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isComplete && (
                <Check className="w-5 h-5 text-green-600" />
              )}
              {isCurrent && (
                <Loader2 className="w-5 h-5 text-[--brand-gold] animate-spin" />
              )}
              {isPending && (
                <div className="w-5 h-5 rounded-full border-2 border-[--brand-muted]/20" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">{stage.label}</p>
              {isCurrent && (
                <p className="text-xs text-[--brand-muted] mt-1">
                  {currentCopy || stage.copies[0]}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}

      {contactCount !== undefined && contactCount > 0 && (
        <p className="text-center text-sm text-[--brand-muted] mt-4">
          {contactCount} contacts found so far
        </p>
      )}
    </div>
  );
}
