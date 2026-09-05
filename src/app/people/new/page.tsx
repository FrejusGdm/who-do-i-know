import { requirePrivatePageSession } from "@/lib/server-session";
import { networkCircles } from "@/lib/network/queries";
import { NetworkShell, PageHeading } from "@/components/network/NetworkShell";
import { CreatePersonForm } from "@/components/network/CreatePersonForm";
export const dynamic = "force-dynamic";
export default async function NewPersonPage() {
  const session = await requirePrivatePageSession();
  const circles = await networkCircles(session.user.id);
  return (
    <NetworkShell active="People">
      <PageHeading
        eyebrow="People / Add someone"
        title="Who’s on your mind?"
        description="Start with a name. The rest can come from a conversation."
      />
      <CreatePersonForm circles={circles} />
    </NetworkShell>
  );
}
