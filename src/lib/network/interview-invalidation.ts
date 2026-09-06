import { and, eq, inArray, sql } from "drizzle-orm";
import { aiProcessingTasks, interviews } from "@/db/schema";
import type { NetworkTx } from "./store";

/** Call under lockMemoryOwner; retain leases until in-flight callers finish. */
export async function invalidateInterviewContexts(
  tx: NetworkTx,
  owner: string,
  ids: string[],
) {
  if (!ids.length) return;
  await tx
    .update(interviews)
    .set({ revision: sql`${interviews.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(interviews.userId, owner), inArray(interviews.id, ids)));
  await tx
    .update(aiProcessingTasks)
    .set({
      status: "canceled",
      errorCategory: "source_changed",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiProcessingTasks.userId, owner),
        eq(aiProcessingTasks.targetType, "interview"),
        inArray(aiProcessingTasks.targetId, ids),
        inArray(aiProcessingTasks.status, ["queued", "processing"]),
      ),
    );
}
