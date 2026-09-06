import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../../src/middleware";
import { GET } from "../../src/app/api/health/route";

test("public liveness does not broaden private API access or reveal configuration", async () => {
  for (const method of ["GET", "HEAD"]) {
    assert.equal(
      middleware(
        new NextRequest("https://example.test/api/health", { method }),
      ).headers.get("x-middleware-next"),
      "1",
    );
  }
  for (const path of [
    "/api/health/private",
    "/api/healthcheck",
    "/api/people",
    "/api/updates",
  ]) {
    assert.equal(
      middleware(new NextRequest(`https://example.test${path}`)).status,
      401,
    );
  }
  assert.equal(
    middleware(
      new NextRequest("https://example.test/api/health", { method: "POST" }),
    ).status,
    403,
  );
  const response = GET();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});
