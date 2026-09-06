import Link from "next/link";
import { requirePrivatePageSession } from "@/lib/server-session";
import { listInterviews } from "@/lib/network/interviews";
import { networkPeople } from "@/lib/network/queries";
import { NetworkShell, PageHeading } from "@/components/network/NetworkShell";
import { CreateInterview } from "@/components/network/CreateInterview";
export const dynamic = "force-dynamic";
export default async function InterviewsPage() {
  const session = await requirePrivatePageSession();
  const [interviews, people] = await Promise.all([
    listInterviews(session.user.id),
    networkPeople(session.user.id, {}),
  ]);
  return (
    <NetworkShell active="Interviews">
      <PageHeading
        eyebrow="A little space to reflect"
        title="Your conversations"
        description="Remember the people, moments and small details that matter to you."
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="space-y-4">
          <h2 className="text-balance text-xl font-medium">
            Pick up where you left off
          </h2>
          {interviews.length ? (
            <ul className="divide-y divide-[#deded5] rounded-lg border border-[#deded5] bg-white">
              {interviews.map((interview) => (
                <li key={interview.id}>
                  <Link
                    href={`/interviews/${interview.id}`}
                    className="block p-5 hover:bg-[#f1f3ed]"
                  >
                    <span className="block break-words font-medium">
                      {interview.title}
                    </span>
                    <span className="mt-2 block text-sm capitalize text-[#62685e]">
                      {interview.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-[#deded5] p-6 text-pretty leading-7 text-[#62685e]">
              Your first conversation starts with whatever is on your mind. No
              perfect notes needed.
            </p>
          )}
          {interviews.length === 100 && (
            <p className="text-sm text-[#62685e]">
              Showing your 100 most recently updated conversations.
            </p>
          )}
        </section>
        <CreateInterview people={people.people} />
      </div>
    </NetworkShell>
  );
}
