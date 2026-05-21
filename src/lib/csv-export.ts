export function csvEscape(value: unknown): string {
  const stringValue = Array.isArray(value)
    ? value.join("; ")
    : value instanceof Date
      ? value.toISOString()
      : value == null
        ? ""
        : String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}
