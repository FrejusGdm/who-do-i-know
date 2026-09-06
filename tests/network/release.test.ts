import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import AdmZip from "adm-zip";

test("release packaging excludes private and uncommitted files and never overwrites an existing file", () => {
  const fixture = mkdtempSync(join(tmpdir(), "network-release-test-"));
  const script = resolve("scripts/package-release.mjs");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: fixture, stdio: "pipe" });
  const files = [
    "Dockerfile",
    ".dockerignore",
    "package.json",
    "package-lock.json",
    "next.config.mjs",
    "tsconfig.json",
    "postcss.config.mjs",
    "tailwind.config.ts",
    ".eslintrc.json",
    "src/fixture.ts",
    "scripts/network-worker.ts",
    "public/assets/logo.png",
    "public/assets/logo.svg",
    "public/hero-ink-grid.svg",
    "public/robots.txt",
    "public/sample.csv",
    "public/screenshot.png",
    ".env.local",
    "notes/private.txt",
  ];
  for (const path of files) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), "synthetic committed fixture");
  }
  git("init", "--quiet");
  git("add", "--", ...files);
  git(
    "-c",
    "user.name=Release fixture",
    "-c",
    "user.email=release@example.test",
    "commit",
    "--quiet",
    "-m",
    "synthetic fixture",
  );
  writeFileSync(join(fixture, "src/fixture.ts"), "UNCOMMITTED OWNER EDIT");
  writeFileSync(join(fixture, "src/untracked.ts"), "UNTRACKED OWNER FILE");
  const output = join(fixture, "release.zip");
  execFileSync(process.execPath, [script, output], {
    cwd: fixture,
    stdio: "pipe",
  });
  const archive = new AdmZip(output);
  assert.equal(
    archive.readAsText("src/fixture.ts"),
    "synthetic committed fixture",
  );
  for (const path of [".env.local", "notes/private.txt", "src/untracked.ts"])
    assert.equal(archive.getEntry(path), null);
  assert.equal(
    archive.readAsText("release-commit.txt").trim(),
    git("rev-parse", "HEAD").toString().trim(),
  );
  const personalFile = join(fixture, "personal.zip");
  writeFileSync(personalFile, "preserve me");
  assert.throws(() =>
    execFileSync(process.execPath, [script, personalFile], {
      cwd: fixture,
      stdio: "pipe",
    }),
  );
  assert.equal(readFileSync(personalFile, "utf8"), "preserve me");
  assert.equal(
    readFileSync(join(fixture, "src/fixture.ts"), "utf8"),
    "UNCOMMITTED OWNER EDIT",
  );
});
