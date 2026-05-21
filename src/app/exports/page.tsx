import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requirePrivatePageSession } from "@/lib/server-session";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

const exports = [
  {
    type: "contacts",
    filename: "contacts.csv",
    description: "Active people only, with contact methods, relationship type, review status, priority, and follow-up dates.",
  },
  {
    type: "emails",
    filename: "emails.csv",
    description: "One row per Gmail message captured during sync, including sender, recipients, subject, and snippet.",
  },
  {
    type: "threads",
    filename: "threads.csv",
    description: "One row per Gmail thread with participants, subject, message count, and latest timestamp.",
  },
  {
    type: "thread_summaries",
    filename: "thread_summaries.csv",
    description: "One row per AI thread worker output, including topics, evidence, confidence, and follow-up signals.",
  },
  {
    type: "person_summaries",
    filename: "person_summaries.csv",
    description: "Latest AI relationship memory for each person, including mentor signal and evidence.",
  },
  {
    type: "mentor_candidates",
    filename: "mentor_candidates.csv",
    description: "Confirmed mentors only, with evidence, contact details, summaries, and private notes. No generated messages.",
  },
  {
    type: "manual_notes",
    filename: "manual_notes.csv",
    description: "Private notes, tags, and follow-up context.",
  },
];

export default async function ExportsPage() {
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
          <h1 className="text-5xl font-semibold tracking-tight">CSV exports</h1>
          <p className="mt-4 max-w-2xl text-neutral-600">
            Focused exports for contacts, email history, AI worker summaries, mentor candidates, and private notes.
          </p>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {exports.map((item) => (
            <article key={item.type} className="border border-neutral-200 p-5">
              <h2 className="text-xl font-semibold">{item.filename}</h2>
              <p className="mt-3 min-h-16 text-sm leading-6 text-neutral-600">{item.description}</p>
              <a
                href={`/api/exports/${item.type}`}
                className="mt-5 inline-flex h-10 items-center gap-2 bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
