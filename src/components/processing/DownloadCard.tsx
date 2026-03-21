"use client";

import { motion } from "framer-motion";
import { Download, Share2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContactRow } from "@/types";

interface DownloadCardProps {
  contactCount: number;
  downloadUrl: string | null;
  isLocal: boolean;
  localContacts?: ContactRow[];
  downloadedAt?: string;
  onDownload: () => void;
}

const samplePreview = [
  { name: "Sarah C.", email: "s***@university.edu", type: "classmate" },
  { name: "Prof. M.", email: "m***@cs.edu", type: "professor" },
  { name: "Alex T.", email: "a***@startup.io", type: "professional" },
  { name: "Jordan L.", email: "j***@gmail.com", type: "friend" },
  { name: "Dr. K.", email: "k***@research.org", type: "mentor" },
];

export function DownloadCard({
  contactCount,
  downloadUrl,
  isLocal,
  downloadedAt,
  onDownload,
}: DownloadCardProps) {
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg w-full mx-auto"
    >
      <div className="text-center mb-8">
        <CheckCircle className="w-12 h-12 text-[--brand-ink] mx-auto mb-4" />
        <h1 className="font-serif text-4xl font-bold mb-2">
          {contactCount} people.
        </h1>
        <p className="text-[--brand-muted] text-lg">
          That&apos;s your network.
        </p>
      </div>

      {/* Preview Table */}
      <div className="mb-8 overflow-hidden rounded-lg border border-[--brand-muted]/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[--brand-ink] text-[--brand-cream]">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {samplePreview.map((row) => (
              <tr
                key={row.email}
                className="border-t border-[--brand-muted]/10"
              >
                <td className="p-3">{row.name}</td>
                <td className="p-3 text-[--brand-muted]">{row.email}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full bg-[--brand-gold]/10 text-[--brand-gold] text-xs">
                    {row.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        size="lg"
        onClick={onDownload}
        disabled={!downloadUrl && !isLocal}
        className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-[--brand-gold] hover:text-[--brand-cream] text-lg py-6 font-semibold transition-all duration-300 mb-4"
      >
        <Download className="w-5 h-5 mr-2" />
        Download CSV
      </Button>

      <div className="text-center space-y-4">
        <div className="p-4 bg-[--brand-muted]/5 border border-[--brand-muted]/20 rounded-lg">
          <p className="text-sm text-[--brand-ink]">
            {isLocal
              ? "Your data never left your device."
              : `Your data has been deleted from our servers.${downloadedAt ? ` Downloaded at ${downloadedAt}.` : ""}`}
          </p>
        </div>

        <div className="pt-4 border-t border-[--brand-muted]/10">
          <p className="text-sm text-[--brand-muted] mb-2">
            Know someone graduating?
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
            }}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Copy Share Link
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
