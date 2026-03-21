import type { ContactRow } from "@/types";

const HEADERS = [
  "name",
  "email",
  "relationship_type",
  "how_we_met",
  "interaction_summary",
  "last_contact",
  "total_emails",
  "confidence",
  "tags",
];

function escapeField(value: string | number | string[]): string {
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(
  contacts: ContactRow[],
  skippedBatches: number
): string {
  const lines: string[] = [];

  if (skippedBatches > 0) {
    lines.push(
      `# Note: ${skippedBatches} batch(es) could not be analyzed and were excluded.`
    );
  }

  lines.push(HEADERS.join(","));

  for (const c of contacts) {
    lines.push(
      HEADERS.map((h) => escapeField(c[h as keyof ContactRow])).join(",")
    );
  }

  return lines.join("\n");
}
