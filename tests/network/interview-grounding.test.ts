import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  validateSourceQuotes,
  privateProposal,
} from "../../src/lib/network/interview-grounding";
import { proposalPayload } from "../../src/lib/network/interview-input";

test("grounding requires exact spans from a current user turn, including Unicode offsets", () => {
  const turn = {
    id: randomUUID(),
    role: "user",
    content: "👋 Alex mentioned a reading group.",
    revision: 1,
    deletedAt: null,
  };
  const source = {
    turnId: turn.id,
    revision: 1,
    start: 3,
    end: turn.content.length,
    quote: "Alex mentioned a reading group.",
  };
  assert.doesNotThrow(() => validateSourceQuotes([source], [turn]));
  assert.throws(() => validateSourceQuotes([{ ...source, start: 2 }], [turn]));
  assert.throws(() =>
    validateSourceQuotes(
      [{ ...source, quote: "An invented promise." }],
      [turn],
    ),
  );
  assert.throws(() =>
    validateSourceQuotes([source], [{ ...turn, role: "assistant" }]),
  );
  assert.throws(() =>
    validateSourceQuotes([source], [{ ...turn, revision: 2 }]),
  );
  assert.throws(() =>
    validateSourceQuotes([source], [{ ...turn, deletedAt: new Date() }]),
  );
  assert.throws(() => validateSourceQuotes([source], []));
});
test("a model cannot opt private memories or personal updates into drafting", () => {
  const personId = randomUUID();
  const note = privateProposal(
    proposalPayload.parse({
      kind: "note",
      personId,
      body: "Private fixture",
      shareInDrafts: true,
    }),
  );
  assert.equal(note.kind === "note" && note.shareInDrafts, false);
  const update = privateProposal(
    proposalPayload.parse({
      kind: "personal_update",
      title: "Fixture",
      body: "Private update",
      allowedPersonIds: [personId],
      allowedCircleIds: [randomUUID()],
    }),
  );
  assert.deepEqual(
    update.kind === "personal_update" && update.allowedPersonIds,
    [],
  );
  assert.deepEqual(
    update.kind === "personal_update" && update.allowedCircleIds,
    [],
  );
});
test("identity can stay unresolved in a proposal while dates retain their real precision", () => {
  const note = proposalPayload.parse({
    kind: "note",
    body: "Someone mentioned a reading group.",
  });
  assert.equal(note.kind === "note" && note.personId, null);
  const event = proposalPayload.parse({
    kind: "interaction",
    values: {
      requestKey: randomUUID(),
      personIds: [],
      body: "A conversation with someone whose name needs resolving",
      channel: "call",
      datePrecision: "month",
      datePhrase: "Sometime in August",
    },
  });
  assert.equal(event.kind === "interaction" && event.values.occurredOn, null);
});
