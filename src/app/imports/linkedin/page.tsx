import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { LinkedInImportForm } from "@/components/imports/LinkedInImportForm";
import { requirePrivatePageSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function LinkedInImportPage() {
  await requirePrivatePageSession();

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-5xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <header className="mt-8 border-b border-neutral-200 pb-7">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">Raw archive ingestion</p>
          <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight">LinkedIn data dump</h1>
          <p className="mt-4 max-w-2xl text-neutral-600">
            Upload the full LinkedIn export zip to preserve the raw files in Postgres and derive connection/message records for later matching.
          </p>
        </header>

        <section className="mt-8">
          <LinkedInImportForm />
        </section>
      </div>
    </main>
  );
}
