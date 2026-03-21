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
      className="max-w-2xl w-full mx-auto"
    >
      <div className="text-center mb-12">
        <div className="w-20 h-20 rounded-full bg-[--brand-ink] flex items-center justify-center mx-auto mb-8 shadow-md">
          <CheckCircle className="w-8 h-8 text-[--brand-cream]" strokeWidth={2} />
        </div>
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">
          {contactCount} people.
        </h1>
        <p className="text-xl text-[--brand-muted] font-light">
          That&apos;s your network.
        </p>
      </div>

      {/* Preview Table */}
      <div className="mb-10 overflow-x-auto rounded-3xl border border-black/5 bg-white/50 backdrop-blur-sm p-2 shadow-sm">
        <div className="overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/5 text-[--brand-ink]">
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Email</th>
                <th className="text-left p-4 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {samplePreview.map((row, i) => (
                <tr
                  key={row.email}
                  className={i !== samplePreview.length - 1 ? "border-b border-black/5" : ""}
                >
                  <td className="p-4 font-medium text-[--brand-ink]">{row.name}</td>
                  <td className="p-4 text-[--brand-muted]">{row.email}</td>
                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full bg-black/5 text-[--brand-ink] text-xs font-medium">
                      {row.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        <Button
          size="lg"
          onClick={onDownload}
          disabled={!downloadUrl && !isLocal}
          className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 text-lg py-7 rounded-full font-medium transition-all duration-300 shadow-xl mb-6"
        >
          <Download className="w-5 h-5 mr-3" />
          Download CSV
        </Button>

        <div className="text-center space-y-6">
          <p className="text-sm font-medium text-[--brand-muted] bg-white/50 backdrop-blur-sm border border-black/5 rounded-full py-2 px-4 inline-block shadow-sm">
            {isLocal
              ? "Your data never left your device."
              : `Your data has been deleted from our servers.${downloadedAt ? ` Downloaded at ${downloadedAt}.` : ""}`}
          </p>

          <div className="pt-6 border-t border-black/5">
            <p className="text-sm text-[--brand-muted] mb-3">
              Know someone graduating?
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full bg-white border-black/5 shadow-sm px-6"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
              }}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Copy Share Link
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
