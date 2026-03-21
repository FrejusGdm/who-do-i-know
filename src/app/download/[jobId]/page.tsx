"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DownloadCard } from "@/components/processing/DownloadCard";
import { AlertCircle } from "lucide-react";

export default function DownloadPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [contactCount, setContactCount] = useState(0);
  const [downloadedAt, setDownloadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        if (!res.ok) throw new Error("Job not found");
        const data = await res.json();

        if (data.status !== "complete") {
          setError(
            data.status === "failed"
              ? data.errorMessage ?? "Processing failed"
              : "Job is still processing"
          );
          return;
        }

        setContactCount(data.contactCount ?? 0);

        const dlRes = await fetch(`/api/download/${jobId}`);
        if (dlRes.ok) {
          const dlData = await dlRes.json();
          setDownloadUrl(dlData.downloadUrl);
        } else {
          setError(
            "This link has expired. Your data has been deleted per our privacy policy."
          );
        }
    } catch {
      setError("Failed to load download.");
    } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId]);

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      setDownloadedAt(new Date().toLocaleString());
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
        <div className="animate-pulse text-[--brand-muted]">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[--brand-cream] px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold mb-2">
            Download Unavailable
          </h1>
          <p className="text-[--brand-muted] mb-4">{error}</p>
          <p className="text-xs text-[--brand-muted]">
            Need help? Contact support@whodoyouknow.xyz
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream] px-6 py-12">
      <DownloadCard
        contactCount={contactCount}
        downloadUrl={downloadUrl}
        isLocal={false}
        downloadedAt={downloadedAt ?? undefined}
        onDownload={handleDownload}
      />
    </main>
  );
}
