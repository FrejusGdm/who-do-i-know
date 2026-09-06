import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";

const output = process.argv[2];
if (!output || !output.endsWith(".zip"))
  throw new Error("Supply a new .zip output path");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const inputs = [
  "Dockerfile",
  ".dockerignore",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
  "postcss.config.mjs",
  "tailwind.config.ts",
  ".eslintrc.json",
  "src",
  "scripts/network-worker.ts",
  "public/assets/logo.png",
  "public/assets/logo.svg",
  "public/hero-ink-grid.svg",
  "public/robots.txt",
  "public/sample.csv",
  "public/screenshot.png",
];
const archive = new AdmZip(
  execFileSync("git", ["archive", "--format=zip", commit, "--", ...inputs], {
    maxBuffer: 64 * 1024 * 1024,
  }),
);
if (!archive.getEntry("Dockerfile") || !archive.getEntry(".dockerignore"))
  throw new Error("Commit the container definition before packaging a release");
archive.addFile("release-commit.txt", Buffer.from(`${commit}\n`));
// Exclusive creation: never replace an existing personal file or prior release.
writeFileSync(resolve(output), archive.toBuffer(), { flag: "wx", mode: 0o600 });
console.log(`Packaged reviewed commit ${commit}`);
