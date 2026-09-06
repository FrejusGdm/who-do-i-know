import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
loadEnvConfig(process.cwd());

async function main() {
  const { runInterviewWorkerOnce } =
    await import("../src/lib/network/interview-jobs");
  const { closeDatabase } = await import("../src/db");
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  try {
    do {
      const worked = await runInterviewWorkerOnce();
      if (process.argv.includes("--once")) break;
      if (!worked && !stopping) await delay(1000);
    } while (!stopping);
  } finally {
    await closeDatabase();
  }
}
main().catch(() => {
  console.error(
    "Network worker stopped unexpectedly; inspect configuration and database health.",
  );
  process.exitCode = 1;
});
