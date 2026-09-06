import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePrivatePageSession } from "@/lib/server-session";
import { getInterview } from "@/lib/network/interviews";
import { networkCircles, networkPeople } from "@/lib/network/queries";
import { NetworkError } from "@/lib/network/store";
import {
  NetworkShell,
  PageHeading,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
import { InterviewWorkspace } from "@/components/network/InterviewWorkspace";
import { interviewAIStatus, interviewJob } from "@/lib/network/interview-jobs";
export const dynamic = "force-dynamic";
export default async function InterviewPage({
  params,
}: {
  params: Promise<{ interviewId: string }>;
}) {
  const session = await requirePrivatePageSession();
  const { interviewId } = await params;
  const record = await getInterview(session.user.id, interviewId).catch(
    (error: unknown) => {
      if (error instanceof NetworkError && error.status === 404) notFound();
      throw error;
    },
  );
  const [people, circles, aiStatus, job] = await Promise.all([
    networkPeople(session.user.id, {}),
    networkCircles(session.user.id),
    interviewAIStatus(session.user.id),
    interviewJob(session.user.id, interviewId),
  ]);
  const options = [
    ...new Map(
      [
        ...people.people,
        ...record.participants.filter((person) => !person.archivedAt),
      ].map((person) => [person.id, person]),
    ).values(),
  ];
  return (
    <NetworkShell active="Interviews">
      <PageHeading
        title={record.interview.title}
        description="A private place to remember, then decide what to keep."
        action={
          <Link className={secondaryButtonClass} href="/interviews">
            All conversations
          </Link>
        }
      />
      <InterviewWorkspace
        initial={record}
        people={options}
        circles={circles}
        initialAI={aiStatus}
        initialJob={job}
      />
    </NetworkShell>
  );
}
