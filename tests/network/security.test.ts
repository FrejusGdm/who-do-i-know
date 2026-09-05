import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorizedEmail, productionAuthConfiguration } from "../../src/lib/private-access";
import { isTrustedMutation, readJsonLimited, readFormDataLimited, RequestError } from "../../src/lib/request-security";

test("private access fails closed and uses exact normalized emails", () => {
  assert.equal(isAuthorizedEmail("owner@example.test", {}), false);
  assert.equal(isAuthorizedEmail("owner@example.test", { PRIVATE_USER_EMAILS: " " }), false);
  const config = { PRIVATE_USER_EMAIL: "Owner@example.test" };
  assert.equal(isAuthorizedEmail("owner@example.test", config), true);
  assert.equal(isAuthorizedEmail("owner@example.test.attacker.test", config), false);
  assert.equal(isAuthorizedEmail("attacker@example.test", config), false);
});
test("production rejects absent/weak secrets and insecure origins", () => {
  const config = { NODE_ENV: "production", BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters", BETTER_AUTH_URL: "https://network.example.test", PRIVATE_USER_EMAIL: "owner@example.test", GOOGLE_CLIENT_ID: "test-id", GOOGLE_CLIENT_SECRET: "test-secret" };
  assert.doesNotThrow(() => productionAuthConfiguration(config));
  assert.throws(() => productionAuthConfiguration({ ...config, BETTER_AUTH_SECRET: "weak" }));
  assert.throws(() => productionAuthConfiguration({ ...config, PRIVATE_USER_EMAIL: "" }));
  assert.throws(() => productionAuthConfiguration({ ...config, BETTER_AUTH_URL: "http://network.example.test" }));
});
test("mutation origins cannot be bypassed by a forged Host, missing origin, or suffix", () => {
  const configured = "https://network.example.test";
  const request = (origin?: string) => new Request(configured, { method: "POST", headers: { ...(origin ? { origin } : {}), host: "attacker.test" } });
  assert.equal(isTrustedMutation(request(configured), configured), true);
  assert.equal(isTrustedMutation(request(), configured), false);
  assert.equal(isTrustedMutation(request("https://network.example.test.attacker.test"), configured), false);
  assert.equal(isTrustedMutation(request("null"), configured), false);
  assert.equal(isTrustedMutation(request(configured), undefined), false);
});
test("JSON size limits apply even without Content-Length", async () => {
  const request = (body: string, contentType = "application/json") => new Request("https://network.example.test", { method: "POST", headers: { "content-type": contentType }, body });
  assert.deepEqual(await readJsonLimited(request('{"ok":true}')), { ok: true });
  await assert.rejects(() => readJsonLimited(request('"' + "x".repeat(100) + '"'), 32), (error: unknown) => error instanceof RequestError && error.status === 413);
  await assert.rejects(() => readJsonLimited(request("not json")), (error: unknown) => error instanceof RequestError && error.status === 400);
  await assert.rejects(() => readJsonLimited(request("{}", "text/plain")), (error: unknown) => error instanceof RequestError && error.status === 415);
});

test("multipart limits apply before parsing even when the sender understates Content-Length", async () => {
  const data = new FormData();
  data.set("file", new Blob(["x".repeat(128)]), "test.zip");
  const request = new Request("https://network.example.test", { method: "POST", body: data });
  request.headers.set("content-length", "1");
  await assert.rejects(() => readFormDataLimited(request, 32), (error: unknown) => error instanceof RequestError && error.status === 413);
  const valid = new Request("https://network.example.test", { method: "POST", body: data });
  assert.ok((await readFormDataLimited(valid, 4096)).get("file") instanceof File);
});
