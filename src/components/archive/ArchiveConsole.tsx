"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Database, Download, FolderOpen, Loader2, Mail, Paperclip, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type ArchiveJob = {
  id: string;
  status: string;
  googleEmail: string | null;
  localFolderPath: string | null;
  messageCountEstimate: number;
  estimatedBytes: number;
  messagesSeen: number;
  messagesArchived: number;
  attachmentsArchived: number;
  contactsArchived: number;
  otherContactsArchived: number;
  bytesArchived: number;
  failureCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stats: Record<string, unknown>;
};

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function isActive(status?: string) {
  return status === "running" || status === "estimating" || status === "pending";
}

type MaterializeStats = {
  peopleFromContacts: number;
  peopleFromEmail: number;
  totalPeople: number;
  threads: number;
  messages: number;
};

export function ArchiveConsole({ initialJob }: { initialJob: ArchiveJob | null }) {
  const [job, setJob] = useState<ArchiveJob | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [materializeStats, setMaterializeStats] = useState<MaterializeStats | null>(null);

  const attachmentsEstimated = useMemo(() => {
    const value = job?.stats?.attachmentsEstimated;
    return typeof value === "number" ? value : 0;
  }, [job]);

  async function refreshStatus() {
    const response = await fetch("/api/archive/status");
    if (!response.ok) return;
    const data = await response.json();
    setJob(data.job);
  }

  useEffect(() => {
    if (!isActive(job?.status)) return;
    const interval = window.setInterval(() => {
      refreshStatus().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [job?.status]);

  function runAction(
    endpoint: "/api/archive/estimate" | "/api/archive/start",
    body?: Record<string, unknown>,
  ) {
    setError(null);
    setIsSubmitting(true);
    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Archive request failed");
        }
        setJob(data.job);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Archive request failed");
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  function runMaterialize() {
    setError(null);
    setMaterializeStats(null);
    setIsMaterializing(true);
    void (async () => {
      try {
        const response = await fetch("/api/archive/materialize", { method: "POST" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Build people request failed");
        }
        setMaterializeStats(data.stats as MaterializeStats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Build people request failed");
      } finally {
        setIsMaterializing(false);
      }
    })();
  }

  const progress =
    job?.messageCountEstimate && job.messageCountEstimate > 0
      ? Math.min(100, Math.round((job.messagesArchived / job.messageCountEstimate) * 100))
      : 0;

  return (
    <div className="space-y-8">
      <section className="border border-neutral-200 bg-white p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
              <Archive className="h-4 w-4" />
              Full Google archive
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
              Download everyone you know.
            </h1>
            <p className="mt-4 text-neutral-600">
              <strong>Download everyone (fast)</strong> pulls every email correspondent and all Google
              Contacts using header metadata only — no size caps, no 500-thread limit. It then builds
              your people list automatically. Use <strong>Build people from archive</strong> to rebuild
              that list any time, then export a complete <code>contacts.csv</code> for Notion. The full
              archive (with raw bodies and attachments) is available too, but is much slower.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-64">
            <Button
              onClick={() => runAction("/api/archive/estimate")}
              disabled={isSubmitting || isActive(job?.status)}
              variant="outline"
              className="justify-start rounded-md"
            >
              {isSubmitting && job?.status !== "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Estimate size
            </Button>
            <Button
              onClick={() => runAction("/api/archive/start", { mode: "light" })}
              disabled={isSubmitting || isActive(job?.status)}
              className="justify-start rounded-md bg-neutral-950 text-white hover:bg-neutral-800"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Download everyone (fast)
            </Button>
            <Button
              onClick={() => runAction("/api/archive/start", { mode: "archive" })}
              disabled={isSubmitting || isActive(job?.status)}
              variant="outline"
              className="justify-start rounded-md"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Start full archive (with bodies)
            </Button>
            <Button
              onClick={runMaterialize}
              disabled={isMaterializing || isActive(job?.status)}
              variant="outline"
              className="justify-start rounded-md"
            >
              {isMaterializing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Build people from archive
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Messages", value: formatNumber(job?.messagesArchived || job?.messagesSeen || job?.messageCountEstimate || 0), icon: Mail },
          { label: "Attachments", value: formatNumber(job?.attachmentsArchived || attachmentsEstimated), icon: Paperclip },
          { label: "Contacts", value: formatNumber((job?.contactsArchived ?? 0) + (job?.otherContactsArchived ?? 0)), icon: Users },
          { label: "Archived bytes", value: formatBytes(job?.bytesArchived || job?.estimatedBytes || 0), icon: Database },
        ].map((stat) => (
          <div key={stat.label} className="border border-neutral-200 p-5">
            <div className="flex items-center justify-between text-neutral-500">
              <span className="text-sm">{stat.label}</span>
              <stat.icon className="h-4 w-4" />
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-neutral-200 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Archive status</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {job ? `${job.status}${job.googleEmail ? ` for ${job.googleEmail}` : ""}` : "No archive job has run yet."}
            </p>
          </div>
          {job?.localFolderPath && (
            <div className="inline-flex max-w-full items-center gap-2 overflow-hidden border border-neutral-200 px-3 py-2 text-sm text-neutral-700">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">{job.localFolderPath}</span>
            </div>
          )}
        </div>

        <div className="mt-6 h-2 bg-neutral-100">
          <div className="h-full bg-neutral-950 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-4 grid gap-3 text-sm text-neutral-600 md:grid-cols-3">
          <p>Estimated messages: {formatNumber(job?.messageCountEstimate ?? 0)}</p>
          <p>Failures: {formatNumber(job?.failureCount ?? 0)}</p>
          <p>Completed: {job?.completedAt ? new Date(job.completedAt).toLocaleString() : "Not complete"}</p>
        </div>

        {(error || job?.errorMessage) && (
          <div className="mt-5 flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error ?? job?.errorMessage}</p>
          </div>
        )}

        {materializeStats && (
          <div className="mt-5 border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <p className="font-medium text-neutral-900">
              Built {formatNumber(materializeStats.totalPeople)} people.
            </p>
            <p className="mt-1">
              {formatNumber(materializeStats.peopleFromContacts)} from Google Contacts ·{" "}
              {formatNumber(materializeStats.peopleFromEmail)} from email ·{" "}
              {formatNumber(materializeStats.threads)} threads ·{" "}
              {formatNumber(materializeStats.messages)} messages linked.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/exports/contacts" className="inline-flex items-center gap-2 border border-neutral-300 px-3 py-1.5 font-medium hover:bg-white">
                <Download className="h-4 w-4" /> contacts.csv
              </a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/exports/person_conversations" className="inline-flex items-center gap-2 border border-neutral-300 px-3 py-1.5 font-medium hover:bg-white">
                <Download className="h-4 w-4" /> person_conversations.csv
              </a>
            </div>
          </div>
        )}
      </section>

      {job?.status === "complete" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Archive files</h2>
            <p className="mt-2 text-sm text-neutral-600">
              These stream the local MBOX and JSONL files from the completed archive folder.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { href: "/api/archive/file/mbox", label: "Download MBOX" },
              { href: "/api/archive/file/messages", label: "Messages JSONL" },
              { href: "/api/archive/file/attachments", label: "Attachments JSONL" },
              { href: "/api/archive/file/connections", label: "Connections JSONL" },
              { href: "/api/archive/file/other_contacts", label: "Other contacts JSONL" },
              { href: "/api/archive/file/manifest", label: "Manifest JSON" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex h-12 items-center justify-center gap-2 border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
              >
                <Download className="h-4 w-4" />
                {link.label}
              </a>
            ))}
          </div>

          <div>
            <h2 className="text-xl font-semibold">Database indexes</h2>
            <p className="mt-2 text-sm text-neutral-600">
              CSV views of the Postgres copy for quick inspection and later processing.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
          {[
            { href: "/api/archive/export/messages", label: "Message index CSV" },
            { href: "/api/archive/export/attachments", label: "Attachment index CSV" },
            { href: "/api/archive/export/people_contacts", label: "People contacts CSV" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex h-12 items-center justify-center gap-2 border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
            >
              <Download className="h-4 w-4" />
              {link.label}
            </a>
          ))}
          </div>
        </section>
      )}
    </div>
  );
}
