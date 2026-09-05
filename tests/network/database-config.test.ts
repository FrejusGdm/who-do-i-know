import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseConfig } from "../../src/db/config";

test("remote database URLs cannot opt out of certificate verification", () => {
  const config = databaseConfig({ DATABASE_URL: "postgres://u:p@example.test/db?sslmode=disable", NODE_ENV: "production" });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
});
test("only local development databases can run without TLS", () => {
  assert.equal(databaseConfig({ DATABASE_URL: "postgres://u@127.0.0.1/test", NODE_ENV: "test" }).ssl, false);
  assert.throws(() => databaseConfig({ DATABASE_URL: "postgres://u@localhost/test", NODE_ENV: "production" }));
  assert.throws(() => databaseConfig({}));
  assert.throws(() => databaseConfig({ DATABASE_URL: "https://example.test" }));
});
