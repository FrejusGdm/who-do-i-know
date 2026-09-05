import { spawn } from "node:child_process";
const value = process.env.TEST_DATABASE_URL;
if (!value)
  throw new Error("Set TEST_DATABASE_URL to a disposable local database");
const url = new URL(value);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Browser tests require a local _test database");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "-p",
    "3007",
    "--hostname",
    "127.0.0.1",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: value,
      BETTER_AUTH_URL: "http://127.0.0.1:3007",
      NEXT_PUBLIC_BETTER_AUTH_URL: "http://127.0.0.1:3007",
      BETTER_AUTH_SECRET: "browser-test-secret-only-never-use-in-production",
      PRIVATE_USER_EMAILS: "network-browser-owner@example.test",
      GOOGLE_CLIENT_ID: "browser-test-id",
      GOOGLE_CLIENT_SECRET: "browser-test-secret",
    },
  },
);
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
