import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { ArchiveConsole } from "@/components/archive/ArchiveConsole";
import { getLatestArchiveJob } from "@/lib/google-archive";
import { requirePrivatePageSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

function serializeJob(job: Awaited<ReturnType<typeof getLatestArchiveJob>>) {
  if (!job) return null;
  return {
    ...job,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

export default async function ArchivePage() {
  const session = await requirePrivatePageSession();
  const latestJob = await getLatestArchiveJob(session.user.id);

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-6xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="mt-8">
          <ArchiveConsole initialJob={serializeJob(latestJob)} />
        </div>
      </div>
    </main>
  );
}
