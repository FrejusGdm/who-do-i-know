import type { SourceQuote, ProposalPayload } from "./interview-input";
import { NetworkError } from "./store";

type EvidenceTurn = {
  id: string;
  role: string;
  content: string;
  revision: number;
  deletedAt: Date | null;
};
export function validateSourceQuotes(
  sources: SourceQuote[],
  turns: EvidenceTurn[],
) {
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  for (const source of sources) {
    const turn = byId.get(source.turnId);
    if (!turn || turn.role !== "user")
      throw new NetworkError(
        400,
        "Every suggestion needs a quote from your own saved words",
      );
    if (turn.deletedAt || turn.revision !== source.revision)
      throw new NetworkError(
        409,
        "The source changed. Generate and review a fresh suggestion",
      );
    if (
      source.end <= source.start ||
      source.end > turn.content.length ||
      turn.content.slice(source.start, source.end) !== source.quote
    ) {
      throw new NetworkError(
        400,
        "The supporting quote does not match its source",
      );
    }
  }
}

/** A model may suggest content, but cannot grant permission to use private content in outreach. */
export function privateProposal(payload: ProposalPayload): ProposalPayload {
  if (payload.kind === "note" || payload.kind === "profile_fact")
    return { ...payload, shareInDrafts: false };
  if (payload.kind === "interaction")
    return { ...payload, values: { ...payload.values, shareInDrafts: false } };
  if (payload.kind === "personal_update")
    return { ...payload, allowedPersonIds: [], allowedCircleIds: [] };
  return payload;
}

export function proposalPeople(payload: ProposalPayload): string[] {
  if ("personId" in payload) return payload.personId ? [payload.personId] : [];
  if (payload.kind === "interaction") return payload.values.personIds;
  if (payload.kind === "personal_update") return payload.allowedPersonIds;
  return [];
}
