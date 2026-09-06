import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundedProviderFetch,
  generateInterview,
  interviewProviderConfig,
  INTERVIEW_LIMITS,
  InterviewProviderError,
  type InterviewContext,
} from "../../src/lib/network/interview-provider";

test("interview AI requires a pinned model and binds consent to configuration, never the credential", () => {
  assert.equal(
    interviewProviderConfig({ OPENROUTER_API_KEY: "test-only" }),
    null,
  );
  assert.equal(
    interviewProviderConfig({ NETWORK_INTERVIEW_MODEL: "fixture/model" }),
    null,
  );
  const first = interviewProviderConfig({
    OPENROUTER_API_KEY: "test-only-a",
    NETWORK_INTERVIEW_MODEL: "fixture/model",
  })!;
  const rotated = interviewProviderConfig({
    OPENROUTER_API_KEY: "test-only-b",
    NETWORK_INTERVIEW_MODEL: "fixture/model",
  })!;
  assert.deepEqual(first, rotated);
  assert.notEqual(
    first.configurationKey,
    interviewProviderConfig({
      OPENROUTER_API_KEY: "test-only-a",
      NETWORK_INTERVIEW_MODEL: "fixture/changed",
    })!.configurationKey,
  );
  assert.equal(JSON.stringify(first).includes("test-only"), false);
});

test("provider fetch forbids other hosts and redirects and bounds response bodies before parsing", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array(INTERVIEW_LIMITS.responseBytes + 1));
  };
  try {
    await assert.rejects(
      () => boundedProviderFetch("http://169.254.169.254/latest/meta-data"),
      InterviewProviderError,
    );
    await assert.rejects(
      () =>
        boundedProviderFetch(
          "https://openrouter.ai.evil.test/api/v1/chat/completions",
        ),
      InterviewProviderError,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      () =>
        boundedProviderFetch("https://openrouter.ai/api/v1/chat/completions"),
      (error: unknown) =>
        error instanceof InterviewProviderError &&
        error.category === "invalid_output",
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("model requests use bounded private routing and invalid output never becomes a fabricated reply", async () => {
  const original = globalThis.fetch;
  const oldModel = process.env.NETWORK_INTERVIEW_MODEL;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.NETWORK_INTERVIEW_MODEL = "fixture/model";
  process.env.OPENROUTER_API_KEY = "test-only-key";
  const context: InterviewContext = {
    mode: "debrief",
    today: "2026-09-06",
    timezone: "Asia/Shanghai",
    turns: [],
    omittedTurnCount: 0,
    people: [],
    circles: [],
    existingPlans: [],
    reviewed: [],
  };
  let content = JSON.stringify({
    assistant: "Who would you like to remember?",
    proposals: [],
  });
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.max_tokens, INTERVIEW_LIMITS.outputTokens);
    assert.deepEqual(body.provider, {
      require_parameters: true,
      zdr: true,
      data_collection: "deny",
    });
    assert.equal(body.tools, undefined);
    assert.equal(body.messages.length, 2);
    return Response.json({
      id: "test-only-response",
      object: "chat.completion",
      created: 0,
      model: "fixture/model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  };
  try {
    const config = interviewProviderConfig()!;
    assert.equal(
      (await generateInterview(context, config)).output.assistant,
      "Who would you like to remember?",
    );
    content = "not JSON; a provider failure is not a user memory";
    await assert.rejects(
      () => generateInterview(context, config),
      (error: unknown) =>
        error instanceof InterviewProviderError &&
        error.category === "invalid_output",
    );
    await assert.rejects(
      () =>
        generateInterview(
          { ...context, mode: "x".repeat(INTERVIEW_LIMITS.contextCharacters) },
          config,
        ),
      (error: unknown) =>
        error instanceof InterviewProviderError &&
        error.category === "context_limit",
    );
  } finally {
    globalThis.fetch = original;
    if (oldModel === undefined) delete process.env.NETWORK_INTERVIEW_MODEL;
    else process.env.NETWORK_INTERVIEW_MODEL = oldModel;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});
