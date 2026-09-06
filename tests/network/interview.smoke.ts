// Explicit opt-in smoke test. Only these synthetic words leave the machine; no DB is opened.
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import {
  generateInterview,
  interviewProviderConfig,
  providerError,
  type InterviewContext,
} from "../../src/lib/network/interview-provider";
import { validateSourceQuotes } from "../../src/lib/network/interview-grounding";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.RUN_REAL_AI_SMOKE !== "1")
    throw new Error("Explicit RUN_REAL_AI_SMOKE=1 is required");
  const config = interviewProviderConfig();
  if (!config)
    throw new Error(
      "Configure a model and provider credential for the smoke test",
    );
  const turn = {
    id: "11111111-1111-4111-8111-111111111111",
    role: "user" as const,
    content:
      "I met Alex and Sam yesterday. Alex enjoys climbing. Sam is applying to graduate school. I promised to send Alex an article next week.",
    revision: 1,
  };
  const context: InterviewContext = {
    mode: "debrief",
    today: "2026-09-06",
    timezone: "Asia/Shanghai",
    turns: [turn],
    omittedTurnCount: 0,
    people: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Alex Fixture",
        organization: null,
        selected: true,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Sam Fixture",
        organization: null,
        selected: true,
      },
    ],
    circles: [],
    existingPlans: [],
    reviewed: [],
  };
  const result = await generateInterview(context, config);
  assert.ok(result.output.assistant.length <= 1000);
  assert.equal((result.output.assistant.match(/[?？]/g) ?? []).length, 1);
  assert.ok(result.output.proposals.length > 0);
  for (const proposal of result.output.proposals)
    validateSourceQuotes(proposal.sources, [{ ...turn, deletedAt: null }]);
  console.log(
    JSON.stringify({
      passed: true,
      model: config.model,
      proposalTypes: result.output.proposals.map(
        (proposal) => proposal.payload.kind,
      ),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }),
  );
}
main().catch((error) => {
  const safe = providerError(error);
  console.error(
    JSON.stringify({
      passed: false,
      category: safe.category,
      httpStatus: safe.httpStatus,
    }),
  );
  process.exitCode = 1;
});
