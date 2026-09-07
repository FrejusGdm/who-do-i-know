import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { DrizzleQueryError } from "drizzle-orm/errors";

// Execute the real route bodies with failing service dependencies. No database or mailbox access.
for (const operation of ["estimate", "materialize", "start", "status"]) {
  test(`archive ${operation} does not expose query payloads in logs or HTTP errors`, async () => {
    const marker = "PRIVATE_SYNTHETIC_MAIL_BODY_AND_TOKEN";
    const failure = new DrizzleQueryError("insert into email_messages values ($1)", [marker], new Error(marker));
    assert.ok(failure.message.includes(marker));
    const logs: unknown[] = [];
    const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
    const source = readFileSync(`src/app/api/archive/${operation}/route.ts`, "utf8");
    const fail = async () => { throw failure; };
    const dependencies: Record<string, unknown> = {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/auth-guard": { requireSession: async () => ({ session: { user: { id: "test-owner" } } }) },
      "@/lib/google-archive": { estimateGoogleArchive: fail, startGoogleArchive: fail, getLatestArchiveJob: fail },
      "@/lib/archive-materialize": { materializeArchiveMemory: fail },
    };
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; },
      console: { error: (...args: unknown[]) => logs.push(args) },
    });
    const response = await (exports.POST ?? exports.GET)(new Request("https://example.test/api/archive/start", { method: "POST", body: "{}" }));
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes(marker), false);
    assert.equal(JSON.stringify(logs).includes(marker), false);
    assert.equal(logs.flat().includes(failure), false);
  });
}
