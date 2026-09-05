import AdmZip from "adm-zip";

export class ArchiveValidationError extends Error {}
const MAX_COMPRESSED = 50 * 1024 * 1024;
const MAX_ENTRY = 10 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;

export function boundedZipFiles(data: Buffer) {
  if (data.byteLength > MAX_COMPRESSED) throw new ArchiveValidationError("The archive must be 50 MB or smaller");
  try {
    const entries = new AdmZip(data).getEntries().filter((entry) => !entry.isDirectory);
    if (entries.length > 1000) throw new ArchiveValidationError("The archive contains too many files");
    let expectedSize = 0;
    const paths = new Set<string>();
    for (const entry of entries) {
      const path = entry.entryName.replace(/\\/g, "/");
      if (path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").includes("..") || path.includes("\0") || paths.has(path)) {
        throw new ArchiveValidationError("The archive contains an unsafe or duplicate file path");
      }
      paths.add(path);
      expectedSize += entry.header.size;
      if (entry.header.size > MAX_ENTRY || expectedSize > MAX_EXPANDED) throw new ArchiveValidationError("The expanded archive is too large");
    }
    let expandedSize = 0;
    return entries.map((entry) => {
      const content = entry.getData();
      expandedSize += content.byteLength;
      if (content.byteLength > MAX_ENTRY || expandedSize > MAX_EXPANDED) throw new ArchiveValidationError("The expanded archive is too large");
      return { path: entry.entryName, content };
    });
  } catch (error) {
    if (error instanceof ArchiveValidationError) throw error;
    throw new ArchiveValidationError("The ZIP archive is invalid or cannot be read safely");
  }
}
