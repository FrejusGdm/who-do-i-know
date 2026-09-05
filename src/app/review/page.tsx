import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, TableProperties } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { ReviewWorkspace, type ReviewPerson } from "@/components/review/ReviewWorkspace";
import { db } from "@/db";
import { aiPersonSummaries, people } from "@/db/schema";
import { requirePrivatePageSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await requirePrivatePageSession();
  const [personRows, summaries] = await Promise.all([
    db.select().from(people).where(eq(people.userId, session.user.id)).orderBy(desc(people.importanceScore)),
    db.select().from(aiPersonSummaries).orderBy(desc(aiPersonSummaries.createdAt)),
  ]);

  const latestSummary = new Map<string, typeof summaries[number]>();
  for (const summary of summaries) {
    if (!latestSummary.has(summary.personId)) latestSummary.set(summary.personId, summary);
  }

  const reviewPeople: ReviewPerson[] = personRows.map((person) => {
    const summary = latestSummary.get(person.id);
    return {
      id: person.id,
      name: person.name,
      primaryEmail: person.primaryEmail ?? "",
      phone: person.phone,
      instagramUrl: person.instagramUrl,
      linkedInUrl: person.linkedInUrl,
      websiteUrl: person.websiteUrl,
      organization: person.organization,
      role: person.role,
      relationshipType: person.relationshipType,
      reviewStatus: person.reviewStatus,
      manualNotes: person.manualNotes,
      lastContactedAt: person.lastContactedAt?.toISOString() ?? null,
      importanceScore: person.importanceScore,
      summary: summary?.summary ?? null,
      mentorSignalScore: summary?.mentorSignalScore ?? null,
    };
  });

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-[1500px]">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <header className="mt-8 border-b border-neutral-200 pb-7">
          <div className="flex items-center gap-3">
            <TableProperties className="h-6 w-6" />
            <h1 className="text-5xl font-semibold tracking-tight">Relationship review</h1>
          </div>
          <p className="mt-4 max-w-3xl text-neutral-600">
            Work through people like a spreadsheet, confirm mentors, move friends out of the mentor queue, add contact details, and archive noisy senders.
          </p>
        </header>

        <ReviewWorkspace initialPeople={reviewPeople} />
      </div>
    </main>
  );
}
