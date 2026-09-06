import Link from "next/link";
import { requirePrivatePageSession } from "@/lib/server-session";
import { listPersonalUpdates } from "@/lib/network/personal-updates";
import {
  NetworkShell,
  PageHeading,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
import { PersonalUpdateLibrary } from "@/components/network/PersonalUpdateLibrary";
export const dynamic = "force-dynamic";
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requirePrivatePageSession();
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10000 ? raw : 1;
  const data = await listPersonalUpdates(session.user.id, page);
  return (
    <NetworkShell active="Updates">
      <PageHeading
        eyebrow="A little news from your life"
        title="Things you might share."
        description="Save a moment, an idea, or a question. Decide who it feels right to share it with when you reconnect."
      />
      <PersonalUpdateLibrary
        updates={data.updates}
        people={data.people}
        circles={data.circles}
      />
      {(page > 1 || data.hasMore) && (
        <nav aria-label="Update pages" className="mt-6 flex gap-3">
          {page > 1 && (
            <Link
              className={secondaryButtonClass}
              href={`/updates?page=${page - 1}`}
            >
              Newer updates
            </Link>
          )}
          {data.hasMore && (
            <Link
              className={secondaryButtonClass}
              href={`/updates?page=${page + 1}`}
            >
              Older updates
            </Link>
          )}
        </nav>
      )}
    </NetworkShell>
  );
}
